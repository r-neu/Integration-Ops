import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const salesforceDir = path.join(root, "data/raw/salesforce-easy-spaces");
const outputPath = path.join(root, "data/processed/open-crm-fixtures.json");
const reportPath = path.join(root, "data/processed/data-quality-report.json");
const salesforceCommit = "cf695b126408e4eb92439292c5c8725b7a94ee7a";

function rowsFromJson(value) {
  return Array.isArray(value) ? value : value.records;
}

function cleanString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizePhone(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return raw;
}

function sourceRef(record) {
  return record.attributes.referenceId;
}

function numberedId(prefix, reference) {
  const suffix = reference.match(/\d+$/)?.[0] ?? reference;
  return `${prefix}-${String(suffix).padStart(3, "0")}`;
}

async function readJson(fileName) {
  return JSON.parse(
    await readFile(path.join(salesforceDir, fileName), "utf8"),
  );
}

const [
  accountRows,
  contactRows,
  leadRows,
  marketRows,
  spaceRows,
  reservationRows,
] = await Promise.all([
  readJson("Accounts.json").then(rowsFromJson),
  readJson("Contacts.json").then(rowsFromJson),
  readJson("Leads.json").then(rowsFromJson),
  readJson("Markets.json").then(rowsFromJson),
  readJson("Spaces.json").then(rowsFromJson),
  readJson("Reservations.json").then(rowsFromJson),
]);

const accountsByRef = new Map(
  accountRows.map((row) => [sourceRef(row), cleanString(row.Name)]),
);
const marketsByRef = new Map(
  marketRows.map((row) => [sourceRef(row), cleanString(row.Name)]),
);
const contactsByRef = new Map(
  contactRows.map((row) => [
    sourceRef(row),
    `${cleanString(row.FirstName)} ${cleanString(row.LastName)}`,
  ]),
);

const accounts = accountRows.map((row) => ({
  id: numberedId("sf-account", sourceRef(row)),
  sourceRef: sourceRef(row),
  sourceObject: "Account",
  name: cleanString(row.Name),
}));

const contacts = contactRows.map((row) => {
  const reservationStatus = cleanString(row.Reservation_Status__c);
  return {
    id: numberedId("sf-contact", sourceRef(row)),
    sourceRef: sourceRef(row),
    sourceObject: "Contact",
    accountRef: row.AccountId.replace(/^@/, ""),
    accountName: accountsByRef.get(row.AccountId.replace(/^@/, "")) ?? null,
    firstName: cleanString(row.FirstName),
    lastName: cleanString(row.LastName),
    fullName: `${cleanString(row.FirstName)} ${cleanString(row.LastName)}`,
    email: cleanString(row.Email),
    city: cleanString(row.MailingCity),
    state: cleanString(row.MailingState),
    postalCode: cleanString(row.MailingPostalCode),
    country: cleanString(row.MailingCountry),
    street: cleanString(row.MailingStreet),
    phoneRaw: cleanString(row.MobilePhone),
    phoneE164: normalizePhone(row.MobilePhone),
    reservationStatus,
    issues: reservationStatus ? [] : ["missing_reservation_status"],
  };
});

const leads = leadRows.map((row) => {
  const industry = cleanString(row.Industry);
  const title = cleanString(row.Title);
  return {
    id: numberedId("sf-lead", sourceRef(row)),
    sourceRef: sourceRef(row),
    sourceObject: "Lead",
    company: cleanString(row.Company),
    firstName: cleanString(row.FirstName),
    lastName: cleanString(row.LastName),
    fullName: `${cleanString(row.FirstName)} ${cleanString(row.LastName)}`,
    email: cleanString(row.Email),
    industry,
    title,
    city: cleanString(row.City),
    state: cleanString(row.State),
    postalCode: cleanString(row.PostalCode),
    country: cleanString(row.Country),
    phoneRaw: cleanString(row.MobilePhone),
    phoneE164: normalizePhone(row.MobilePhone),
    numberOfEmployees:
      typeof row.NumberOfEmployees === "number" ? row.NumberOfEmployees : null,
    issues: [
      ...(industry ? [] : ["missing_industry"]),
      ...(title ? [] : ["missing_title"]),
    ],
  };
});

const markets = marketRows.map((row) => ({
  id: numberedId("sf-market", sourceRef(row)),
  sourceRef: sourceRef(row),
  sourceObject: "Market__c",
  name: cleanString(row.Name),
  city: cleanString(row.City__c),
  state: cleanString(row.State__c),
  country: cleanString(row.Country__c),
}));

const spaces = spaceRows.map((row) => ({
  id: numberedId("sf-space", sourceRef(row)),
  sourceRef: sourceRef(row),
  sourceObject: "Space__c",
  name: cleanString(row.Name),
  marketRef: row.Market__c.replace(/^@/, ""),
  marketName: marketsByRef.get(row.Market__c.replace(/^@/, "")) ?? null,
  category: cleanString(row.Category__c),
  type: cleanString(row.Type__c),
  dailyBookingRate: Number(row.Daily_Booking_Rate__c),
  minimumCapacity: Number(row.Minimum_Capacity__c),
  maximumCapacity: Number(row.Maximum_Capacity__c),
}));

const reservations = reservationRows.map((row) => ({
  id: numberedId("sf-reservation", sourceRef(row)),
  sourceRef: sourceRef(row),
  sourceObject: "Reservation__c",
  contactRef: row.Contact__c.replace(/^@/, ""),
  contactName: contactsByRef.get(row.Contact__c.replace(/^@/, "")) ?? null,
  marketRef: row.Market__c.replace(/^@/, ""),
  marketName: marketsByRef.get(row.Market__c.replace(/^@/, "")) ?? null,
  startDate: cleanString(row.Start_Date__c),
  endDate: cleanString(row.End_Date__c),
  status: cleanString(row.Status__c),
  guestCount: Number(row.Total_Number_of_Guests__c),
}));

const salesforceCount =
  accounts.length +
  contacts.length +
  leads.length +
  markets.length +
  spaces.length +
  reservations.length;
const quality = {
  salesforceCc0Records: salesforceCount,
  totalRecords: salesforceCount,
  resolvedContactAccountLinks: contacts.filter((row) => row.accountName).length,
  resolvedSpaceMarketLinks: spaces.filter((row) => row.marketName).length,
  resolvedReservationContactLinks: reservations.filter((row) => row.contactName)
    .length,
  normalizedPhones: [...contacts, ...leads].filter(
    (row) => row.phoneRaw !== row.phoneE164,
  ).length,
  contactsMissingReservationStatus: contacts.filter(
    (row) => !row.reservationStatus,
  ).length,
  leadsMissingIndustry: leads.filter((row) => !row.industry).length,
  leadsMissingTitle: leads.filter((row) => !row.title).length,
};

const output = {
  preparedAt: "2026-07-28",
  sources: [
    {
      id: "salesforce-easy-spaces",
      name: "Salesforce Easy Spaces sample application",
      url: `https://github.com/trailheadapps/easy-spaces-lwc/tree/${salesforceCommit}`,
      license: "CC0-1.0",
      version: salesforceCommit,
      recordNature: "Official, open-licensed fictional sample records",
      use: "Core account, contact, lead, market, space, and reservation records",
    },
  ],
  quality,
  salesforce: { accounts, contacts, leads, markets, spaces, reservations },
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
await writeFile(reportPath, `${JSON.stringify({ preparedAt: output.preparedAt, quality }, null, 2)}\n`);

console.log(
  `Prepared ${quality.totalRecords} CC0-licensed Salesforce sample records.`,
);
