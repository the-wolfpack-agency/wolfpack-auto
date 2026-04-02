/**
 * Unit Tests — General Ledger Engine
 *
 * Validates journal entry validation, trial balance, P&L generation,
 * chart of accounts, and deal auto-posting.
 */

import {
  validateJournalEntry,
  calculateEntryTotals,
  generateTrialBalance,
  generateProfitAndLoss,
  createDealPostingLines,
  getDefaultChartOfAccounts,
  DEALER_CHART_OF_ACCOUNTS,
  type JournalEntry,
} from "@/lib/general-ledger";

describe("General Ledger Engine", () => {
  describe("Chart of Accounts", () => {
    test("has standard dealer accounts", () => {
      const coa = getDefaultChartOfAccounts();
      expect(coa.length).toBeGreaterThan(30);
    });

    test("all account types are valid", () => {
      const validTypes = ["asset", "liability", "equity", "revenue", "expense", "cogs"];
      for (const acct of DEALER_CHART_OF_ACCOUNTS) {
        expect(validTypes).toContain(acct.account_type);
      }
    });

    test("all account numbers are unique", () => {
      const numbers = DEALER_CHART_OF_ACCOUNTS.map((a) => a.account_number);
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    test("has key dealer accounts", () => {
      const numbers = new Set(DEALER_CHART_OF_ACCOUNTS.map((a) => a.account_number));
      expect(numbers.has("1010")).toBe(true); // Cash
      expect(numbers.has("1200")).toBe(true); // New Vehicle Inventory
      expect(numbers.has("1210")).toBe(true); // Used Vehicle Inventory
      expect(numbers.has("2100")).toBe(true); // Floor Plan - New
      expect(numbers.has("4010")).toBe(true); // New Vehicle Sales
      expect(numbers.has("4020")).toBe(true); // Used Vehicle Sales
      expect(numbers.has("4100")).toBe(true); // F&I Income
      expect(numbers.has("5010")).toBe(true); // Cost of New Vehicles
      expect(numbers.has("6020")).toBe(true); // Commissions
    });

    test("returns copies (immutable)", () => {
      const a = getDefaultChartOfAccounts();
      const b = getDefaultChartOfAccounts();
      expect(a).not.toBe(b);
    });
  });

  describe("Journal Entry Validation", () => {
    test("accepts balanced entry", () => {
      const entry: JournalEntry = {
        entry_date: "2026-04-02",
        description: "Test entry",
        source_type: "manual",
        lines: [
          { account_number: "1010", description: "Cash", debit: 1000, credit: 0 },
          { account_number: "4010", description: "Revenue", debit: 0, credit: 1000 },
        ],
      };
      const result = validateJournalEntry(entry);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("rejects unbalanced entry", () => {
      const entry: JournalEntry = {
        entry_date: "2026-04-02",
        description: "Unbalanced",
        source_type: "manual",
        lines: [
          { account_number: "1010", description: "Cash", debit: 1000, credit: 0 },
          { account_number: "4010", description: "Revenue", debit: 0, credit: 900 },
        ],
      };
      const result = validateJournalEntry(entry);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("do not equal"))).toBe(true);
    });

    test("rejects entry with less than 2 lines", () => {
      const entry: JournalEntry = {
        entry_date: "2026-04-02",
        description: "Single line",
        source_type: "manual",
        lines: [{ account_number: "1010", description: "Cash", debit: 1000, credit: 0 }],
      };
      const result = validateJournalEntry(entry);
      expect(result.valid).toBe(false);
    });

    test("rejects negative amounts", () => {
      const entry: JournalEntry = {
        entry_date: "2026-04-02",
        description: "Negative",
        source_type: "manual",
        lines: [
          { account_number: "1010", description: "Cash", debit: -100, credit: 0 },
          { account_number: "4010", description: "Revenue", debit: 0, credit: -100 },
        ],
      };
      const result = validateJournalEntry(entry);
      expect(result.valid).toBe(false);
    });

    test("rejects both debit and credit on same line", () => {
      const entry: JournalEntry = {
        entry_date: "2026-04-02",
        description: "Both",
        source_type: "manual",
        lines: [
          { account_number: "1010", description: "Cash", debit: 100, credit: 100 },
          { account_number: "4010", description: "Revenue", debit: 0, credit: 0 },
        ],
      };
      const result = validateJournalEntry(entry);
      expect(result.valid).toBe(false);
    });

    test("rejects missing description", () => {
      const entry: JournalEntry = {
        entry_date: "2026-04-02",
        description: "",
        source_type: "manual",
        lines: [
          { account_number: "1010", description: "Cash", debit: 100, credit: 0 },
          { account_number: "4010", description: "Revenue", debit: 0, credit: 100 },
        ],
      };
      const result = validateJournalEntry(entry);
      expect(result.valid).toBe(false);
    });

    test("handles floating point precision", () => {
      const entry: JournalEntry = {
        entry_date: "2026-04-02",
        description: "Precision test",
        source_type: "manual",
        lines: [
          { account_number: "1010", description: "", debit: 33.33, credit: 0 },
          { account_number: "1020", description: "", debit: 33.33, credit: 0 },
          { account_number: "1030", description: "", debit: 33.34, credit: 0 },
          { account_number: "4010", description: "", debit: 0, credit: 100.00 },
        ],
      };
      const result = validateJournalEntry(entry);
      expect(result.valid).toBe(true);
    });
  });

  describe("Entry Totals", () => {
    test("calculates totals correctly", () => {
      const totals = calculateEntryTotals([
        { account_number: "1010", description: "", debit: 500, credit: 0 },
        { account_number: "1020", description: "", debit: 300, credit: 0 },
        { account_number: "4010", description: "", debit: 0, credit: 800 },
      ]);
      expect(totals.total_debits).toBe(800);
      expect(totals.total_credits).toBe(800);
      expect(totals.is_balanced).toBe(true);
    });

    test("detects imbalance", () => {
      const totals = calculateEntryTotals([
        { account_number: "1010", description: "", debit: 500, credit: 0 },
        { account_number: "4010", description: "", debit: 0, credit: 400 },
      ]);
      expect(totals.is_balanced).toBe(false);
    });
  });

  describe("Trial Balance", () => {
    test("generates balanced trial balance", () => {
      const tb = generateTrialBalance([
        { account_number: "1010", name: "Cash", account_type: "asset", balance: 50000, normal_balance: "debit" },
        { account_number: "2010", name: "AP", account_type: "liability", balance: 20000, normal_balance: "credit" },
        { account_number: "3020", name: "RE", account_type: "equity", balance: 30000, normal_balance: "credit" },
      ]);
      expect(tb.is_balanced).toBe(true);
      expect(tb.total_debits).toBe(50000);
      expect(tb.total_credits).toBe(50000);
    });

    test("rows contain all accounts", () => {
      const tb = generateTrialBalance([
        { account_number: "1010", name: "Cash", account_type: "asset", balance: 100, normal_balance: "debit" },
        { account_number: "4010", name: "Sales", account_type: "revenue", balance: 100, normal_balance: "credit" },
      ]);
      expect(tb.rows).toHaveLength(2);
    });
  });

  describe("Profit & Loss", () => {
    test("calculates net income", () => {
      const pnl = generateProfitAndLoss([
        { account_number: "4010", name: "Sales", account_type: "revenue", sub_type: "", balance: 100000 },
        { account_number: "5010", name: "COGS", account_type: "cogs", sub_type: "", balance: 70000 },
        { account_number: "6010", name: "Salaries", account_type: "expense", sub_type: "", balance: 15000 },
        { account_number: "6100", name: "Marketing", account_type: "expense", sub_type: "", balance: 5000 },
      ]);
      expect(pnl.revenue).toBe(100000);
      expect(pnl.cogs).toBe(70000);
      expect(pnl.gross_profit).toBe(30000);
      expect(pnl.expenses).toBe(20000);
      expect(pnl.net_income).toBe(10000);
    });

    test("handles zero revenue", () => {
      const pnl = generateProfitAndLoss([]);
      expect(pnl.net_income).toBe(0);
    });
  });

  describe("Deal Auto-Posting", () => {
    test("creates journal lines for a deal with correct accounts", () => {
      const lines = createDealPostingLines({
        selling_price: 35000,
        cost: 30000,
        is_new: true,
        fi_revenue: 2000,
        fi_cost: 500,
        doc_fee: 499,
        tax_collected: 2485,
        trade_allowance: 13000,
        trade_acv: 12000,
        cash_received: 5000,
        amount_financed: 32984,
      });

      expect(lines.length).toBeGreaterThan(4);

      // Verify key accounts are present
      expect(lines.some((l) => l.account_number === "1010")).toBe(true); // Cash
      expect(lines.some((l) => l.account_number === "1120")).toBe(true); // Contracts in transit
      expect(lines.some((l) => l.account_number === "4010")).toBe(true); // New Vehicle Sales
      expect(lines.some((l) => l.account_number === "5010")).toBe(true); // Cost of new
      expect(lines.some((l) => l.account_number === "4100")).toBe(true); // F&I income
      expect(lines.some((l) => l.account_number === "2200")).toBe(true); // Sales tax
    });

    test("uses correct accounts for new vs used", () => {
      const newLines = createDealPostingLines({
        selling_price: 35000, cost: 30000, is_new: true,
        fi_revenue: 0, fi_cost: 0, doc_fee: 0, tax_collected: 0,
        trade_allowance: 0, trade_acv: 0, cash_received: 35000, amount_financed: 0,
      });
      expect(newLines.some((l) => l.account_number === "4010")).toBe(true); // New Vehicle Sales
      expect(newLines.some((l) => l.account_number === "1200")).toBe(true); // New Inventory

      const usedLines = createDealPostingLines({
        selling_price: 20000, cost: 15000, is_new: false,
        fi_revenue: 0, fi_cost: 0, doc_fee: 0, tax_collected: 0,
        trade_allowance: 0, trade_acv: 0, cash_received: 20000, amount_financed: 0,
      });
      expect(usedLines.some((l) => l.account_number === "4020")).toBe(true); // Used Vehicle Sales
      expect(usedLines.some((l) => l.account_number === "1210")).toBe(true); // Used Inventory
    });

    test("handles trade-in over-allowance", () => {
      const lines = createDealPostingLines({
        selling_price: 30000, cost: 25000, is_new: false,
        fi_revenue: 0, fi_cost: 0, doc_fee: 0, tax_collected: 0,
        trade_allowance: 15000, trade_acv: 12000,
        cash_received: 15000, amount_financed: 0,
      });
      // Over-allowance of $3000 should be an expense
      const overAllow = lines.find((l) => l.account_number === "6900");
      expect(overAllow).toBeDefined();
      expect(overAllow!.debit).toBe(3000);
    });
  });
});
