(function () {
  'use strict'

  var CUSTOM_VALUE = '__custom__'
  var STYLE_ID = 'beef-vendor-shortcuts-style'
  var SELECT_CLASS = 'beef-vendor-select'
  var WRAPPER_CLASS = 'beef-vendor-select-wrapper'
  var LABEL_CLASS = 'beef-vendor-select-label'

  var vendorStateUrl = determineVendorStateUrl()
  var vendorOptions = []
  var vendorLookup = {}
  var vendorLoading = false
  var vendorErrorMessage = ''
  var inputIdCounter = 0
  var selectionByInput = {}
  var initialized = false
  var observer = null

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function onReady() {
        document.removeEventListener('DOMContentLoaded', onReady)
        callback()
      })
    } else {
      callback()
    }
  }

  function normalizeBaseUrl(value) {
    if (!value) return ''
    return String(value).replace(/\/+$/, '')
  }

  function determineVendorStateUrl() {
    try {
      var globalConfig = typeof window !== 'undefined' ? window.config : null
      if (globalConfig && globalConfig.beefStatsApi && globalConfig.beefStatsApi.host) {
        var host = normalizeBaseUrl(globalConfig.beefStatsApi.host)
        if (host) {
          return host + '/delivery-estimator/state'
        }
      }
      if (typeof window !== 'undefined' && window.location) {
        var protocol = window.location.protocol || 'http:'
        var hostname = window.location.hostname || 'localhost'
        if (hostname.indexOf(':') >= 0 && hostname[0] !== '[') {
          hostname = '[' + hostname + ']'
        }
        return protocol + '//' + hostname + ':8000/delivery-estimator/state'
      }
    } catch (error) {
      console.warn('Unable to determine vendor state URL', error)
    }
    return null
  }

  function formatVendorLabel(vendor) {
    var parts = []
    if (vendor.locationName) parts.push(vendor.locationName)
    if (vendor.address) parts.push(vendor.address)
    if (parts.length === 0) parts.push('Vendor ' + vendor.id)
    return parts.join(' \u2013 ')
  }

  function normalizeVendors(list) {
    vendorOptions = []
    vendorLookup = {}
    if (!Array.isArray(list)) return
    for (var index = 0; index < list.length; index += 1) {
      var entry = list[index]
      if (!entry || typeof entry !== 'object') continue
      if (typeof entry.id !== 'number' || !isFinite(entry.id)) continue
      if (typeof entry.latitude !== 'number' || !isFinite(entry.latitude)) continue
      if (typeof entry.longitude !== 'number' || !isFinite(entry.longitude)) continue
      var normalized = {
        id: entry.id,
        latitude: Number(entry.latitude),
        longitude: Number(entry.longitude),
        locationName: entry.locationName || '',
        address: entry.address || '',
      }
      vendorOptions.push(normalized)
      vendorLookup[String(normalized.id)] = normalized
    }
    vendorOptions.sort(function (a, b) {
      var labelA = formatVendorLabel(a).toLowerCase()
      var labelB = formatVendorLabel(b).toLowerCase()
      if (labelA < labelB) return -1
      if (labelA > labelB) return 1
      return a.id - b.id
    })
  }

  function applyStyles() {
    if (document.getElementById(STYLE_ID)) return
    var style = document.createElement('style')
    style.id = STYLE_ID
    style.type = 'text/css'
    style.textContent =
      '.' + WRAPPER_CLASS + ' {\n' +
      '  margin-top: 0.5rem;\n' +
      '  display: block;\n' +
      '  grid-column: 1 / -1;\n' +
      '}\n' +
      '.' + LABEL_CLASS + ' {\n' +
      '  display: block;\n' +
      '  font-size: 0.75rem;\n' +
      '  font-weight: 600;\n' +
      '  color: #3c4858;\n' +
      '  margin-bottom: 0.25rem;\n' +
      '}\n' +
      '.' + SELECT_CLASS + ' {\n' +
      '  width: 100%;\n' +
      '  padding: 0.35rem 0.5rem;\n' +
      '  border: 1px solid #c8ccd4;\n' +
      '  border-radius: 4px;\n' +
      '  font: inherit;\n' +
      '  background-color: #ffffff;\n' +
      '  color: #1f2937;\n' +
      '}\n' +
      '.' + SELECT_CLASS + ':focus {\n' +
      '  outline: 2px solid #3578e5;\n' +
      '  outline-offset: 1px;\n' +
      '}\n' +
      '.' + SELECT_CLASS + ':disabled {\n' +
      '  color: #6b7280;\n' +
      '  background-color: #f3f4f6;\n' +
      '  cursor: not-allowed;\n' +
      '}\n'
    document.head.appendChild(style)
  }

  function assignInputId(input) {
    if (input.dataset && input.dataset.beefVendorInputId) {
      return input.dataset.beefVendorInputId
    }
    inputIdCounter += 1
    var id = 'beef-vendor-input-' + inputIdCounter
    if (input.dataset) {
      input.dataset.beefVendorInputId = id
    } else {
      input.setAttribute('data-beef-vendor-input-id', id)
    }
    return id
  }

  function findInputById(id) {
    return document.querySelector('input[data-beef-vendor-input-id="' + id + '"]')
  }

  function findSelectByInputId(id) {
    return document.querySelector('select.' + SELECT_CLASS + '[data-for-input="' + id + '"]')
  }

  function createOption(value, label) {
    var option = document.createElement('option')
    option.value = value
    option.textContent = label
    return option
  }

  function getRouteInputs() {
    var all = document.querySelectorAll('input')
    var results = []
    for (var i = 0; i < all.length; i += 1) {
      var input = all[i]
      if (input instanceof HTMLInputElement === false) continue
      if (input.type && input.type !== 'text' && input.type !== 'search') continue
      if (input.dataset && input.dataset.beefVendorIgnore === '1') continue
      var placeholder = (input.getAttribute('placeholder') || '').toLowerCase()
      var ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase()
      if (
        placeholder === 'from' ||
        placeholder === 'to' ||
        placeholder === 'add location' ||
        placeholder === 'add location…' ||
        placeholder === 'add via' ||
        ariaLabel === 'from' ||
        ariaLabel === 'to' ||
        ariaLabel === 'add location' ||
        ariaLabel === 'location' ||
        ariaLabel === 'destination'
      ) {
        results.push(input)
      }
    }
    return results
  }

  function attachSelectToInput(input) {
    var inputId = assignInputId(input)
    if (input.dataset && input.dataset.beefVendorAttached === '1') {
      return
    }

    var wrapper = document.createElement('div')
    wrapper.className = WRAPPER_CLASS

    var label = document.createElement('label')
    label.className = LABEL_CLASS
    var selectId = 'beef-vendor-select-' + inputId
    label.setAttribute('for', selectId)
    label.textContent = 'Saved vendor locations'

    var select = document.createElement('select')
    select.className = SELECT_CLASS
    select.id = selectId
    select.setAttribute('aria-label', 'Use a saved vendor location')
    select.dataset.forInput = inputId

    select.addEventListener('change', function (event) {
      var value = event.target.value
      var targetInput = findInputById(inputId)
      if (!targetInput) return
      if (!value) {
        return
      }
      if (value === CUSTOM_VALUE) {
        selectionByInput[inputId] = CUSTOM_VALUE
        if (typeof targetInput.focus === 'function') {
          targetInput.focus()
        }
        return
      }
      var vendor = vendorLookup[value]
      if (!vendor) {
        selectionByInput[inputId] = CUSTOM_VALUE
        return
      }
      applyVendorToInput(targetInput, vendor, select)
    })

    wrapper.appendChild(label)
    wrapper.appendChild(select)

    if (input.parentNode) {
      if (input.nextSibling) {
        input.parentNode.insertBefore(wrapper, input.nextSibling)
      } else {
        input.parentNode.appendChild(wrapper)
      }
    }

    if (input.dataset) {
      input.dataset.beefVendorAttached = '1'
    } else {
      input.setAttribute('data-beef-vendor-attached', '1')
    }


  }

  function applyVendorToInput(input, vendor, select) {
    var inputId = assignInputId(input)
    var index = parseInt(inputId.split('-')[3]) - 1
    if (window.applyVendorSelection) {
        window.applyVendorSelection(index, vendor);
    } else {
        console.error('applyVendorSelection function not found');
    }
  }

  function updateSelectOptions(select) {
    while (select.firstChild) {
      select.removeChild(select.firstChild)
    }

    if (!vendorStateUrl) {
      select.disabled = true
      var unavailable = createOption('', 'Saved vendor shortcuts unavailable')
      unavailable.disabled = true
      unavailable.selected = true
      select.appendChild(unavailable)
      return
    }

    if (vendorLoading) {
      select.disabled = true
      var loading = createOption('', 'Loading saved vendor locations…')
      loading.disabled = true
      loading.selected = true
      select.appendChild(loading)
      return
    }

    if (vendorOptions.length === 0) {
      select.disabled = true
      var empty = createOption('', vendorErrorMessage || 'No saved vendor locations yet')
      empty.disabled = true
      empty.selected = true
      select.appendChild(empty)
      return
    }

    select.disabled = false

    var placeholder = createOption('', 'Select a saved vendor location')
    placeholder.disabled = true
    placeholder.selected = true
    select.appendChild(placeholder)

    var customOption = createOption(CUSTOM_VALUE, 'Enter a custom location')
    select.appendChild(customOption)

    for (var i = 0; i < vendorOptions.length; i += 1) {
      var vendor = vendorOptions[i]
      var option = createOption(String(vendor.id), formatVendorLabel(vendor))
      select.appendChild(option)
    }

    var inputId = select.dataset.forInput
    var currentSelection = selectionByInput[inputId] || ''
    if (currentSelection && vendorLookup[currentSelection]) {
      select.value = currentSelection
    } else if (currentSelection === CUSTOM_VALUE) {
      select.value = CUSTOM_VALUE
    } else {
      select.value = ''
    }
  }

  function updateAllSelects() {
    var selects = document.querySelectorAll('select.' + SELECT_CLASS)
    for (var i = 0; i < selects.length; i += 1) {
      updateSelectOptions(selects[i])
    }
  }

  function renderSelects() {
    var inputs = getRouteInputs()
    for (var i = 0; i < inputs.length; i += 1) {
      attachSelectToInput(inputs[i])
    }
    updateAllSelects()
  }

  function watchDom() {
    if (observer || typeof MutationObserver === 'undefined') {
      return
    }
    observer = new MutationObserver(function (mutations) {
      var shouldRefresh = false
      for (var m = 0; m < mutations.length; m += 1) {
        var mutation = mutations[m]
        for (var n = 0; n < mutation.addedNodes.length; n += 1) {
          var node = mutation.addedNodes[n]
          if (!(node instanceof HTMLElement)) {
            continue
          }
          if (node.classList && node.classList.contains(WRAPPER_CLASS)) {
            continue
          }
          if (node.matches && node.matches('input')) {
            shouldRefresh = true
            break
          }
          if (node.querySelector && node.querySelector('input')) {
            shouldRefresh = true
            break
          }
        }
        if (shouldRefresh) break
      }
      if (shouldRefresh) {
        renderSelects()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }

  function fetchVendorLocations() {
    if (!vendorStateUrl) {
      vendorLoading = false
      vendorErrorMessage = ''
      normalizeVendors([])
      updateAllSelects()
      return Promise.resolve([])
    }
    vendorLoading = true
    vendorErrorMessage = ''
    updateAllSelects()
    return fetch(vendorStateUrl, { credentials: 'include' })
      .then(function (response) {
        vendorLoading = false
        if (response.status === 404) {
          normalizeVendors([])
          updateAllSelects()
          return []
        }
        if (!response.ok) {
          throw new Error('Failed to load saved vendor locations (status ' + response.status + ')')
        }
        return response.json()
      })
      .then(function (payload) {
        var vendors = payload && Array.isArray(payload.vendors) ? payload.vendors : []
        normalizeVendors(vendors)
        updateAllSelects()
        return vendorOptions
      })
      .catch(function (error) {
        vendorLoading = false
        vendorErrorMessage = 'Unable to load saved vendor locations'
        console.warn('Failed to load saved vendor locations', error)
        normalizeVendors([])
        updateAllSelects()
        return []
      })
  }

  function initialize() {
    if (initialized) return
    initialized = true
    applyStyles()
    renderSelects()
    watchDom()
    if (vendorStateUrl) {
      fetchVendorLocations()
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          fetchVendorLocations()
        }
      })
    } else {
      updateAllSelects()
    }
  }

  ready(initialize)
})()
