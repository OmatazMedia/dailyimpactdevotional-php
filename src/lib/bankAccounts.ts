/**
 * Shared bank-transfer account model.
 *
 * Multiple accounts are stored as a single settings key `bank_accounts` holding
 * a JSON string (the settings API stores everything as strings, and both the
 * PHP backend and the local mock merge it transparently). The legacy flat keys
 * (bank_name / bank_account_name / bank_account_number) are still honoured on
 * load so existing installs migrate their single account automatically.
 */

export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  currency: string;
  // International / additional transfer details (all optional).
  swift: string; // SWIFT/BIC code
  iban: string;
  routing: string; // routing number / sort code / bank code
  internationalFormat: string; // e.g. "0123 4567 8901 0000"
  extraDetails: string; // any other instructions
}

export const BANK_CURRENCIES = [
  "NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR", "CAD", "AUD", "ZMW", "XOF",
] as const;

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyBankAccount(currency = "NGN"): BankAccount {
  return {
    id: uid(),
    bankName: "",
    accountName: "",
    accountNumber: "",
    currency,
    swift: "",
    iban: "",
    routing: "",
    internationalFormat: "",
    extraDetails: "",
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Ensure every parsed account has an id and string-typed optional fields. */
function normalizeAccounts(raw: unknown[]): BankAccount[] {
  return raw.map((item) => {
    const a = (item ?? {}) as Record<string, unknown>;
    return {
      id: str(a.id) || uid(),
      bankName: str(a.bankName),
      accountName: str(a.accountName),
      accountNumber: str(a.accountNumber),
      currency: str(a.currency) || "NGN",
      swift: str(a.swift),
      iban: str(a.iban),
      routing: str(a.routing),
      internationalFormat: str(a.internationalFormat),
      extraDetails: str(a.extraDetails),
    };
  });
}

/**
 * Read the bank account list out of a settings object.
 *
 * `bank_accounts` is authoritative when present (an explicit empty array means
 * "no accounts"). If it's missing, fall back to the legacy single-account flat
 * keys so pre-upgrade installs keep their existing details.
 */
export function parseBankAccounts(settings: Record<string, unknown>): BankAccount[] {
  const raw = settings.bank_accounts;

  // Accept both the stored JSON string and (defensively) a pre-parsed array.
  let parsed: unknown = null;
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  } else if (Array.isArray(raw)) {
    parsed = raw;
  }

  // A NON-EMPTY array is authoritative. An empty/missing array is NOT: the
  // backend merges a 'bank_accounts' => '[]' default into every GET response,
  // so on pre-upgrade installs this key is present-but-empty even though the
  // legacy flat keys still hold the real single account. Treating "[]" as
  // authoritative would silently wipe those accounts from the Donate modal.
  if (Array.isArray(parsed) && parsed.length > 0) {
    return normalizeAccounts(parsed);
  }

  // Legacy flat-key migration (single account).
  const legacyNumber = str(settings.bank_account_number).trim();
  if (legacyNumber !== "") {
    return [
      {
        id: uid(),
        bankName: str(settings.bank_name),
        accountName: str(settings.bank_account_name),
        accountNumber: legacyNumber,
        currency: str(settings.bank_currency) || "NGN",
        swift: "",
        iban: "",
        routing: "",
        internationalFormat: "",
        extraDetails: "",
      },
    ];
  }
  return [];
}

/** Serialize accounts to the JSON string stored in the `bank_accounts` setting. */
export function serializeBankAccounts(accounts: BankAccount[]): string {
  return JSON.stringify(accounts);
}
