export interface DdItem {
  Store_ID: string;
  Store_Name: string;
  ASGS_NAME: string;
  Date_Opened: string;
  Region_ID: string;
}

export interface FiscalItem {
  FiscalDate: string;
  FiscalYear: string;
  WeekInYear: string;
  DayInWeek: string;
  DayInYear: string;
  CalQuarter: string;
}

export interface SalesDdsResponse {
  SubClass: DdItem[];
  FiscalCalendar: FiscalItem[];
}

export interface SalesPivotRow {
  STORE_ID: string;
  STORE_NAME: string;
  TERRITORY: string;
  REGION_ID?: string;
  DATE_OPENED: string;
  DAY_SALES_CY: number;
  DAY_SALES_LY: number;
  DAY_SALES_COMP: number;
  WTD_SALES_CY: number;
  WTD_SALES_LY: number;
  WTD_SALES_COMP: number;
  QTD_SALES_CY: number;
  QTD_SALES_LY: number;
  QTD_SALES_COMP: number;
  YTD_SALES_CY: number;
  YTD_SALES_LY: number;
  YTD_SALES_COMP: number;
  IS_TERRITORY_TOTAL?: boolean;
  IS_GRAND_TOTAL?: boolean;
  [key: string]: any;
}

export interface SalesPivotSumResponse {
  PivotData: SalesPivotRow[];
  TotalCount: number;
}

export interface SalesHistRow {
  [key: string]: any;
}

export type TabName = 'allSales' | 'topSales' | 'laggards' | 'analytics' | 'salesByOrigin';

export interface SalesChartResponse {
  Labels: string[];
  Sales: number[];
  Sma: (number | null)[];
}
