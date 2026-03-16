import './index.css'
import logoUrl from './assets/dburger.jpeg'
import ChartSubprimals from './components/chart_subprimals'
import Chart5DayAvg from './components/chart_5_day_avg'
import ChartLive from './components/chart_live'
import ChartFeed from './components/ChartFeed'
import DeliveryEstimator from './components/DeliveryEstimator'
import ReceiptInput from './components/ReceiptInput'
import InvoicePage from './components/InvoicePage'
import React, { useEffect, useMemo, useState } from 'react'

type ReportType =
  | 'Sub Primals'
  | 'Feed'
  | 'Cattle Price'
  | '5 Day AVG'
  | 'Delivery Estimator'
  | 'Data Entry'
  | 'Invoices'

function fromHash(hash: string): ReportType {
  const h = hash.replace(/^#/, '').toLowerCase()
  if (h === 'feed') return 'Feed'
  if (h === '5day' || h === 'avg5') return '5 Day AVG'
  if (h === 'live') return 'Cattle Price'
  if (h === 'receipt' || h === 'receipt-input') return 'Data Entry'
  if (h === 'invoice') return 'Invoices'
  if (h === 'delivery' || h === 'delivery-cost' || h === 'delivery-cost-estimator') return 'Delivery Estimator'
  return 'Sub Primals'
}

export default function App() {
  const [reportType, setReportType] = useState<ReportType>(() => fromHash(window.location.hash))
  useEffect(() => {
    const onHash = () => setReportType(fromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const content = useMemo(() => {
    if (reportType === 'Feed') return <ChartFeed />
    if (reportType === '5 Day AVG') return <Chart5DayAvg />
    if (reportType === 'Cattle Price') return <ChartLive />
    if (reportType === 'Delivery Estimator') return <DeliveryEstimator />
    if (reportType === 'Data Entry') return <ReceiptInput />
    if (reportType === 'Invoices') return <InvoicePage />
    return <ChartSubprimals />
  }, [reportType])

  return (
    <>
      <header className="site-header" role="banner">
        <span className="brand-wrap brand-left" aria-label="Beef">
          <span className="text-layer text-outline" aria-hidden>Beef</span>
          <span className="text-layer text-fill" aria-hidden>Beef</span>
        </span>
        <img src={logoUrl} alt="Brand logo" className="brand-logo" />
        <span className="brand-wrap brand-right" aria-label="Stats">
          <span className="text-layer text-outline" aria-hidden>Stats</span>
          <span className="text-layer text-fill" aria-hidden>Stats</span>
        </span>
      </header>
      <main className="site-content" role="main">
        <div className="content-center">
          {content}
        </div>
      </main>
    </>
  )
}
