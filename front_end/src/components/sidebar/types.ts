export type TableKey = 'cow_sheet' | 'choice' | 'prime' | 'select'
export type ReportType = 'boxed' | 'retail'

export type BaseSidebarProps = {
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

export type GraphsModeProps = BaseSidebarProps & {
  mode: 'graphs'
  onOpenViewer: () => void
}

export type PdfModeProps = BaseSidebarProps & {
  mode: 'pdf'
  onBackToGraphs: () => void
  reportType: ReportType
  setReportType: (t: ReportType) => void
  reports: Array<{ id: number | string; date: string }>
  selectedId: number | string | null
  setSelectedId: (id: number | string) => void
}

export type SidebarProps = GraphsModeProps | PdfModeProps
