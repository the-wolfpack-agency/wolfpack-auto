/**
 * General Ledger Engine
 *
 * Double-entry bookkeeping for automotive dealerships:
 *  - Chart of accounts with dealer-standard structure
 *  - Journal entry creation and validation (debits must equal credits)
 *  - Financial statement generation (P&L, Balance Sheet, Trial Balance)
 *  - Period close workflow
 *  - Automated posting from deals and service ROs
 *
 * All entries are immutable once posted. Corrections are made via
 * reversing entries, not edits. Full audit trail.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense" | "cogs";

export type NormalBalance = "debit" | "credit";

export interface GLCompany {
  id: string;
  dealer_id: string;
  name: string;
  code: string;
  legal_name: string;
  entity_type: "dealership" | "holding" | "realty" | "finance_co" | "other";
  is_parent: boolean;
  parent_company_id: string | null;
  is_active: boolean;
  fiscal_year_start: number;
}

export interface ChartAccount {
  account_number: string;
  name: string;
  account_type: AccountType;
  sub_type: string;
  normal_balance: NormalBalance;
  parent_number?: string;
  is_header: boolean;
  company_id?: string;
}

export interface JournalLine {
  account_number: string;
  description: string;
  debit: number;
  credit: number;
  department?: string;
}

export interface JournalEntry {
  entry_date: string;
  description: string;
  memo?: string;
  source_type: "manual" | "deal" | "service_ro" | "payment" | "payroll" | "adjustment" | "closing" | "intercompany";
  source_id?: string;
  company_id?: string;
  lines: JournalLine[];
}

export interface IntercompanyTransaction {
  from_company_id: string;
  to_company_id: string;
  amount: number;
  description: string;
  from_lines: JournalLine[];
  to_lines: JournalLine[];
}

export interface ConsolidatedBalance {
  account_number: string;
  account_name: string;
  account_type: AccountType;
  company_balances: { company_id: string; company_name: string; balance: number }[];
  elimination_amount: number;
  consolidated_balance: number;
}

export interface TrialBalanceRow {
  account_number: string;
  account_name: string;
  account_type: AccountType;
  debit_balance: number;
  credit_balance: number;
}

export interface FinancialStatement {
  period: string;
  generated_at: string;
  rows: StatementRow[];
  totals: Record<string, number>;
}

export interface StatementRow {
  account_number: string;
  account_name: string;
  account_type: AccountType;
  sub_type: string;
  amount: number;
  is_header: boolean;
  depth: number;
}

/* ------------------------------------------------------------------ */
/*  Standard Dealer Chart of Accounts                                  */
/* ------------------------------------------------------------------ */

/**
 * Default chart of accounts for an automotive dealership.
 * Follows NADA/standard dealer accounting conventions.
 */
export const DEALER_CHART_OF_ACCOUNTS: ChartAccount[] = [
  // ASSETS
  { account_number: "1000", name: "Assets", account_type: "asset", sub_type: "", normal_balance: "debit", is_header: true },
  { account_number: "1010", name: "Cash - Operating", account_type: "asset", sub_type: "cash", normal_balance: "debit", parent_number: "1000", is_header: false },
  { account_number: "1020", name: "Cash - Payroll", account_type: "asset", sub_type: "cash", normal_balance: "debit", parent_number: "1000", is_header: false },
  { account_number: "1100", name: "Accounts Receivable - Trade", account_type: "asset", sub_type: "accounts_receivable", normal_balance: "debit", parent_number: "1000", is_header: false },
  { account_number: "1110", name: "Accounts Receivable - Finance", account_type: "asset", sub_type: "accounts_receivable", normal_balance: "debit", parent_number: "1000", is_header: false },
  { account_number: "1120", name: "Contracts in Transit", account_type: "asset", sub_type: "accounts_receivable", normal_balance: "debit", parent_number: "1000", is_header: false },
  { account_number: "1200", name: "New Vehicle Inventory", account_type: "asset", sub_type: "inventory", normal_balance: "debit", parent_number: "1000", is_header: false },
  { account_number: "1210", name: "Used Vehicle Inventory", account_type: "asset", sub_type: "inventory", normal_balance: "debit", parent_number: "1000", is_header: false },
  { account_number: "1220", name: "Parts Inventory", account_type: "asset", sub_type: "inventory", normal_balance: "debit", parent_number: "1000", is_header: false },
  { account_number: "1150", name: "Intercompany Receivable", account_type: "asset", sub_type: "intercompany", normal_balance: "debit", parent_number: "1000", is_header: false },
  { account_number: "1300", name: "Prepaid Expenses", account_type: "asset", sub_type: "prepaid", normal_balance: "debit", parent_number: "1000", is_header: false },
  { account_number: "1400", name: "Fixed Assets", account_type: "asset", sub_type: "fixed_asset", normal_balance: "debit", parent_number: "1000", is_header: false },
  { account_number: "1410", name: "Accumulated Depreciation", account_type: "asset", sub_type: "contra_asset", normal_balance: "credit", parent_number: "1000", is_header: false },

  // LIABILITIES
  { account_number: "2000", name: "Liabilities", account_type: "liability", sub_type: "", normal_balance: "credit", is_header: true },
  { account_number: "2010", name: "Accounts Payable", account_type: "liability", sub_type: "accounts_payable", normal_balance: "credit", parent_number: "2000", is_header: false },
  { account_number: "2020", name: "Accrued Expenses", account_type: "liability", sub_type: "accrued", normal_balance: "credit", parent_number: "2000", is_header: false },
  { account_number: "2050", name: "Intercompany Payable", account_type: "liability", sub_type: "intercompany", normal_balance: "credit", parent_number: "2000", is_header: false },
  { account_number: "2100", name: "Floor Plan - New", account_type: "liability", sub_type: "notes_payable", normal_balance: "credit", parent_number: "2000", is_header: false },
  { account_number: "2110", name: "Floor Plan - Used", account_type: "liability", sub_type: "notes_payable", normal_balance: "credit", parent_number: "2000", is_header: false },
  { account_number: "2200", name: "Sales Tax Payable", account_type: "liability", sub_type: "tax_payable", normal_balance: "credit", parent_number: "2000", is_header: false },
  { account_number: "2300", name: "Payroll Tax Payable", account_type: "liability", sub_type: "tax_payable", normal_balance: "credit", parent_number: "2000", is_header: false },
  { account_number: "2400", name: "Customer Deposits", account_type: "liability", sub_type: "deposits", normal_balance: "credit", parent_number: "2000", is_header: false },

  // EQUITY
  { account_number: "3000", name: "Equity", account_type: "equity", sub_type: "", normal_balance: "credit", is_header: true },
  { account_number: "3010", name: "Owner's Equity", account_type: "equity", sub_type: "owners_equity", normal_balance: "credit", parent_number: "3000", is_header: false },
  { account_number: "3020", name: "Retained Earnings", account_type: "equity", sub_type: "retained_earnings", normal_balance: "credit", parent_number: "3000", is_header: false },

  // REVENUE
  { account_number: "4000", name: "Revenue", account_type: "revenue", sub_type: "", normal_balance: "credit", is_header: true },
  { account_number: "4010", name: "New Vehicle Sales", account_type: "revenue", sub_type: "sales_revenue", normal_balance: "credit", parent_number: "4000", is_header: false },
  { account_number: "4020", name: "Used Vehicle Sales", account_type: "revenue", sub_type: "sales_revenue", normal_balance: "credit", parent_number: "4000", is_header: false },
  { account_number: "4100", name: "F&I Income", account_type: "revenue", sub_type: "fi_revenue", normal_balance: "credit", parent_number: "4000", is_header: false },
  { account_number: "4110", name: "Reserve Income", account_type: "revenue", sub_type: "fi_revenue", normal_balance: "credit", parent_number: "4000", is_header: false },
  { account_number: "4200", name: "Service Labor Revenue", account_type: "revenue", sub_type: "service_revenue", normal_balance: "credit", parent_number: "4000", is_header: false },
  { account_number: "4210", name: "Parts Sales Revenue", account_type: "revenue", sub_type: "parts_revenue", normal_balance: "credit", parent_number: "4000", is_header: false },
  { account_number: "4300", name: "Doc Fee Revenue", account_type: "revenue", sub_type: "fee_revenue", normal_balance: "credit", parent_number: "4000", is_header: false },
  { account_number: "4900", name: "Other Income", account_type: "revenue", sub_type: "other_revenue", normal_balance: "credit", parent_number: "4000", is_header: false },

  // COST OF GOODS SOLD
  { account_number: "5000", name: "Cost of Goods Sold", account_type: "cogs", sub_type: "", normal_balance: "debit", is_header: true },
  { account_number: "5010", name: "Cost of New Vehicles Sold", account_type: "cogs", sub_type: "cost_of_sales", normal_balance: "debit", parent_number: "5000", is_header: false },
  { account_number: "5020", name: "Cost of Used Vehicles Sold", account_type: "cogs", sub_type: "cost_of_sales", normal_balance: "debit", parent_number: "5000", is_header: false },
  { account_number: "5100", name: "F&I Product Cost", account_type: "cogs", sub_type: "cost_of_sales", normal_balance: "debit", parent_number: "5000", is_header: false },
  { account_number: "5200", name: "Parts Cost of Sales", account_type: "cogs", sub_type: "cost_of_sales", normal_balance: "debit", parent_number: "5000", is_header: false },

  // EXPENSES
  { account_number: "6000", name: "Operating Expenses", account_type: "expense", sub_type: "", normal_balance: "debit", is_header: true },
  { account_number: "6010", name: "Salaries & Wages", account_type: "expense", sub_type: "payroll_expense", normal_balance: "debit", parent_number: "6000", is_header: false },
  { account_number: "6020", name: "Commissions", account_type: "expense", sub_type: "payroll_expense", normal_balance: "debit", parent_number: "6000", is_header: false },
  { account_number: "6030", name: "Payroll Taxes", account_type: "expense", sub_type: "payroll_expense", normal_balance: "debit", parent_number: "6000", is_header: false },
  { account_number: "6040", name: "Employee Benefits", account_type: "expense", sub_type: "payroll_expense", normal_balance: "debit", parent_number: "6000", is_header: false },
  { account_number: "6100", name: "Advertising & Marketing", account_type: "expense", sub_type: "operating_expense", normal_balance: "debit", parent_number: "6000", is_header: false },
  { account_number: "6110", name: "Floor Plan Interest", account_type: "expense", sub_type: "interest_expense", normal_balance: "debit", parent_number: "6000", is_header: false },
  { account_number: "6200", name: "Rent & Occupancy", account_type: "expense", sub_type: "operating_expense", normal_balance: "debit", parent_number: "6000", is_header: false },
  { account_number: "6210", name: "Utilities", account_type: "expense", sub_type: "operating_expense", normal_balance: "debit", parent_number: "6000", is_header: false },
  { account_number: "6300", name: "Insurance", account_type: "expense", sub_type: "operating_expense", normal_balance: "debit", parent_number: "6000", is_header: false },
  { account_number: "6400", name: "Technology & Software", account_type: "expense", sub_type: "operating_expense", normal_balance: "debit", parent_number: "6000", is_header: false },
  { account_number: "6500", name: "Depreciation", account_type: "expense", sub_type: "depreciation", normal_balance: "debit", parent_number: "6000", is_header: false },
  { account_number: "6900", name: "Other Expenses", account_type: "expense", sub_type: "other_expense", normal_balance: "debit", parent_number: "6000", is_header: false },
];

/* ------------------------------------------------------------------ */
/*  Journal Entry Validation                                           */
/* ------------------------------------------------------------------ */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a journal entry before posting.
 * Enforces double-entry: total debits must equal total credits.
 */
export function validateJournalEntry(entry: JournalEntry): ValidationResult {
  const errors: string[] = [];

  if (!entry.entry_date) errors.push("Entry date is required");
  if (!entry.description || entry.description.trim().length === 0) {
    errors.push("Description is required");
  }
  if (!entry.lines || entry.lines.length < 2) {
    errors.push("At least 2 lines required (debit and credit)");
  }

  let totalDebits = 0;
  let totalCredits = 0;

  for (let i = 0; i < (entry.lines?.length ?? 0); i++) {
    const line = entry.lines[i];

    if (!line.account_number) {
      errors.push(`Line ${i + 1}: Account number is required`);
    }
    if (line.debit < 0 || line.credit < 0) {
      errors.push(`Line ${i + 1}: Amounts cannot be negative`);
    }
    if (line.debit > 0 && line.credit > 0) {
      errors.push(`Line ${i + 1}: A line cannot have both debit and credit`);
    }
    if (line.debit === 0 && line.credit === 0) {
      errors.push(`Line ${i + 1}: Either debit or credit must be non-zero`);
    }

    totalDebits += line.debit;
    totalCredits += line.credit;
  }

  // Round to avoid floating point issues
  totalDebits = Math.round(totalDebits * 100) / 100;
  totalCredits = Math.round(totalCredits * 100) / 100;

  if (totalDebits !== totalCredits) {
    errors.push(
      `Debits ($${totalDebits.toFixed(2)}) do not equal credits ($${totalCredits.toFixed(2)}). Difference: $${Math.abs(totalDebits - totalCredits).toFixed(2)}`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Calculate entry totals.
 */
export function calculateEntryTotals(lines: JournalLine[]): {
  total_debits: number;
  total_credits: number;
  is_balanced: boolean;
} {
  let total_debits = 0;
  let total_credits = 0;

  for (const line of lines) {
    total_debits += line.debit;
    total_credits += line.credit;
  }

  total_debits = Math.round(total_debits * 100) / 100;
  total_credits = Math.round(total_credits * 100) / 100;

  return {
    total_debits,
    total_credits,
    is_balanced: total_debits === total_credits,
  };
}

/* ------------------------------------------------------------------ */
/*  Financial Statement Generation                                     */
/* ------------------------------------------------------------------ */

/**
 * Generate a Trial Balance from account balances.
 */
export function generateTrialBalance(
  accounts: { account_number: string; name: string; account_type: AccountType; balance: number; normal_balance: NormalBalance }[],
): { rows: TrialBalanceRow[]; total_debits: number; total_credits: number; is_balanced: boolean } {
  let total_debits = 0;
  let total_credits = 0;
  const rows: TrialBalanceRow[] = [];

  for (const acct of accounts) {
    const isDebitNormal = acct.normal_balance === "debit";
    const debit_balance = isDebitNormal && acct.balance >= 0 ? acct.balance : (!isDebitNormal && acct.balance < 0 ? Math.abs(acct.balance) : 0);
    const credit_balance = !isDebitNormal && acct.balance >= 0 ? acct.balance : (isDebitNormal && acct.balance < 0 ? Math.abs(acct.balance) : 0);

    total_debits += debit_balance;
    total_credits += credit_balance;

    rows.push({
      account_number: acct.account_number,
      account_name: acct.name,
      account_type: acct.account_type,
      debit_balance: Math.round(debit_balance * 100) / 100,
      credit_balance: Math.round(credit_balance * 100) / 100,
    });
  }

  return {
    rows,
    total_debits: Math.round(total_debits * 100) / 100,
    total_credits: Math.round(total_credits * 100) / 100,
    is_balanced: Math.round(total_debits * 100) === Math.round(total_credits * 100),
  };
}

/**
 * Generate a P&L statement by summing revenue and expense accounts.
 */
export function generateProfitAndLoss(
  accounts: { account_number: string; name: string; account_type: AccountType; sub_type: string; balance: number }[],
): { revenue: number; cogs: number; gross_profit: number; expenses: number; net_income: number } {
  let revenue = 0;
  let cogs = 0;
  let expenses = 0;

  for (const acct of accounts) {
    switch (acct.account_type) {
      case "revenue":
        revenue += acct.balance;
        break;
      case "cogs":
        cogs += acct.balance;
        break;
      case "expense":
        expenses += acct.balance;
        break;
    }
  }

  const gross_profit = revenue - cogs;
  const net_income = gross_profit - expenses;

  return {
    revenue: Math.round(revenue * 100) / 100,
    cogs: Math.round(cogs * 100) / 100,
    gross_profit: Math.round(gross_profit * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    net_income: Math.round(net_income * 100) / 100,
  };
}

/* ------------------------------------------------------------------ */
/*  Auto-Posting Templates                                             */
/* ------------------------------------------------------------------ */

/**
 * Generate journal entry lines for a vehicle sale deal.
 */
export function createDealPostingLines(deal: {
  selling_price: number;
  cost: number;
  is_new: boolean;
  fi_revenue: number;
  fi_cost: number;
  doc_fee: number;
  tax_collected: number;
  trade_allowance: number;
  trade_acv: number;
  cash_received: number;
  amount_financed: number;
}): JournalLine[] {
  const lines: JournalLine[] = [];
  const vehicleType = deal.is_new ? "New" : "Used";

  // DR: Cash / Contracts in Transit
  if (deal.cash_received > 0) {
    lines.push({ account_number: "1010", description: "Cash received", debit: deal.cash_received, credit: 0 });
  }
  if (deal.amount_financed > 0) {
    lines.push({ account_number: "1120", description: "Contract in transit", debit: deal.amount_financed, credit: 0 });
  }

  // DR: Used Vehicle Inventory (trade-in at ACV)
  if (deal.trade_acv > 0) {
    lines.push({ account_number: "1210", description: "Trade-in at ACV", debit: deal.trade_acv, credit: 0 });
  }

  // CR: Vehicle Sales Revenue
  lines.push({
    account_number: deal.is_new ? "4010" : "4020",
    description: `${vehicleType} vehicle sale`,
    debit: 0,
    credit: deal.selling_price,
  });

  // DR: Cost of Vehicle Sold
  lines.push({
    account_number: deal.is_new ? "5010" : "5020",
    description: `Cost of ${vehicleType.toLowerCase()} vehicle`,
    debit: deal.cost,
    credit: 0,
  });

  // CR: Vehicle Inventory (remove sold vehicle)
  lines.push({
    account_number: deal.is_new ? "1200" : "1210",
    description: `Remove ${vehicleType.toLowerCase()} from inventory`,
    debit: 0,
    credit: deal.cost,
  });

  // F&I
  if (deal.fi_revenue > 0) {
    lines.push({ account_number: "4100", description: "F&I income", debit: 0, credit: deal.fi_revenue });
    lines.push({ account_number: "5100", description: "F&I product cost", debit: deal.fi_cost, credit: 0 });
  }

  // Doc fee
  if (deal.doc_fee > 0) {
    lines.push({ account_number: "4300", description: "Doc fee", debit: 0, credit: deal.doc_fee });
  }

  // Sales tax
  if (deal.tax_collected > 0) {
    lines.push({ account_number: "2200", description: "Sales tax collected", debit: 0, credit: deal.tax_collected });
  }

  // Trade-in allowance over ACV (over-allowance = expense)
  if (deal.trade_allowance > deal.trade_acv) {
    const overAllow = deal.trade_allowance - deal.trade_acv;
    lines.push({ account_number: "6900", description: "Trade over-allowance", debit: overAllow, credit: 0 });
  }

  return lines;
}

/**
 * Get the default chart of accounts for seeding a new dealer.
 */
export function getDefaultChartOfAccounts(): ChartAccount[] {
  return [...DEALER_CHART_OF_ACCOUNTS];
}

/* ------------------------------------------------------------------ */
/*  Multi-Company Support                                              */
/* ------------------------------------------------------------------ */

/**
 * Validate an intercompany transaction.
 * Both sides must balance, and companies must be different.
 */
export function validateIntercompanyTransaction(
  tx: IntercompanyTransaction,
): ValidationResult {
  const errors: string[] = [];

  if (!tx.from_company_id) errors.push("from_company_id is required");
  if (!tx.to_company_id) errors.push("to_company_id is required");
  if (tx.from_company_id === tx.to_company_id) {
    errors.push("from_company_id and to_company_id must be different");
  }
  if (tx.amount <= 0) errors.push("amount must be positive");
  if (!tx.description) errors.push("description is required");

  // Validate both sides balance
  const fromEntry: JournalEntry = {
    entry_date: new Date().toISOString().split("T")[0],
    description: tx.description,
    source_type: "intercompany",
    company_id: tx.from_company_id,
    lines: tx.from_lines,
  };
  const toEntry: JournalEntry = {
    entry_date: new Date().toISOString().split("T")[0],
    description: tx.description,
    source_type: "intercompany",
    company_id: tx.to_company_id,
    lines: tx.to_lines,
  };

  const fromValidation = validateJournalEntry(fromEntry);
  const toValidation = validateJournalEntry(toEntry);

  if (!fromValidation.valid) {
    errors.push(...fromValidation.errors.map((e) => `From-side: ${e}`));
  }
  if (!toValidation.valid) {
    errors.push(...toValidation.errors.map((e) => `To-side: ${e}`));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate intercompany journal lines for a transfer between entities.
 * Creates matching entries on both sides using intercompany receivable/payable.
 */
export function createIntercompanyLines(
  amount: number,
  description: string,
  fromAccountNumber: string,
  toAccountNumber: string,
): { from_lines: JournalLine[]; to_lines: JournalLine[] } {
  // Intercompany receivable/payable account (convention: 1150/2150)
  const IC_RECEIVABLE = "1150";
  const IC_PAYABLE = "2150";

  return {
    from_lines: [
      { account_number: IC_RECEIVABLE, description: `IC receivable: ${description}`, debit: amount, credit: 0 },
      { account_number: fromAccountNumber, description, debit: 0, credit: amount },
    ],
    to_lines: [
      { account_number: toAccountNumber, description, debit: amount, credit: 0 },
      { account_number: IC_PAYABLE, description: `IC payable: ${description}`, debit: 0, credit: amount },
    ],
  };
}

/**
 * Consolidate balances across multiple companies.
 * Sums balances per account, applies intercompany eliminations.
 */
export function consolidateBalances(
  companyBalances: {
    company_id: string;
    company_name: string;
    accounts: { account_number: string; account_name: string; account_type: AccountType; balance: number }[];
  }[],
  eliminations: { account_number: string; amount: number }[] = [],
): ConsolidatedBalance[] {
  // Aggregate by account_number
  const byAccount = new Map<string, ConsolidatedBalance>();

  for (const company of companyBalances) {
    for (const acct of company.accounts) {
      const existing = byAccount.get(acct.account_number) ?? {
        account_number: acct.account_number,
        account_name: acct.account_name,
        account_type: acct.account_type,
        company_balances: [],
        elimination_amount: 0,
        consolidated_balance: 0,
      };

      existing.company_balances.push({
        company_id: company.company_id,
        company_name: company.company_name,
        balance: acct.balance,
      });

      byAccount.set(acct.account_number, existing);
    }
  }

  // Apply eliminations and calculate consolidated totals
  const eliminationMap = new Map(eliminations.map((e) => [e.account_number, e.amount]));

  const results: ConsolidatedBalance[] = [];
  for (const [, consolidated] of byAccount) {
    const rawTotal = consolidated.company_balances.reduce((sum, cb) => sum + cb.balance, 0);
    consolidated.elimination_amount = eliminationMap.get(consolidated.account_number) ?? 0;
    consolidated.consolidated_balance = Math.round(
      (rawTotal - consolidated.elimination_amount) * 100,
    ) / 100;
    results.push(consolidated);
  }

  // Sort by account number
  results.sort((a, b) => a.account_number.localeCompare(b.account_number));
  return results;
}

/**
 * Generate a consolidated P&L across multiple companies.
 */
export function generateConsolidatedPnL(
  consolidated: ConsolidatedBalance[],
): { revenue: number; cogs: number; gross_profit: number; expenses: number; net_income: number; company_count: number } {
  let revenue = 0;
  let cogs = 0;
  let expenses = 0;

  const companyIds = new Set<string>();

  for (const bal of consolidated) {
    for (const cb of bal.company_balances) {
      companyIds.add(cb.company_id);
    }

    switch (bal.account_type) {
      case "revenue":
        revenue += bal.consolidated_balance;
        break;
      case "cogs":
        cogs += bal.consolidated_balance;
        break;
      case "expense":
        expenses += bal.consolidated_balance;
        break;
    }
  }

  return {
    revenue: Math.round(revenue * 100) / 100,
    cogs: Math.round(cogs * 100) / 100,
    gross_profit: Math.round((revenue - cogs) * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    net_income: Math.round((revenue - cogs - expenses) * 100) / 100,
    company_count: companyIds.size,
  };
}
