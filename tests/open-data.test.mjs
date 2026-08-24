import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixtureUrl = new URL(
  "../data/processed/open-crm-fixtures.json",
  import.meta.url,
);
const rawDir = new URL("../data/raw/salesforce-easy-spaces/", import.meta.url);

const pinnedHashes = {
  "Accounts.json":
    "b02e8e0604ca8c21f89abb187c1aa9e2f92c681210754a3764f5a63969e214ee",
  "Contacts.json":
    "7790e45f229c9eb13488352870b5f9736f605dfccb6a10de50c649d51ff4fc28",
  "Leads.json":
    "f7a1ecf4b5af41979022337df91c269a02f07626d21d85214bf02e53165c4166",
  "Markets.json":
    "abb48b20c3e9e7ce18c635540f8d42d876cf887de84df3006ba91b19dc3dadba",
  "Spaces.json":
    "fd44f9688578a222b11b7ab87a63e6a9f77b6818bc76954d87d13dc47c297737",
  "Reservations.json":
    "185e81f6fc7f08727e173f6a348abf360bcd6a4db2bffca6ab3a03b17b367bdc",
  LICENSE:
    "a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499",
};

test("keeps the CC0 fixture complete and source-pinned", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

  assert.equal(fixture.quality.salesforceCc0Records, 180);
  assert.equal(fixture.quality.totalRecords, 180);
  assert.equal(fixture.quality.resolvedContactAccountLinks, 12);
  assert.equal(fixture.quality.resolvedSpaceMarketLinks, 132);
  assert.equal(fixture.quality.resolvedReservationContactLinks, 2);
  assert.equal(fixture.salesforce.contacts.length, 12);
  assert.equal(fixture.salesforce.spaces.length, 132);
  assert.equal(fixture.sources.length, 1);
  assert.equal(fixture.sources[0].license, "CC0-1.0");
  assert.equal(
    fixture.sources[0].version,
    "cf695b126408e4eb92439292c5c8725b7a94ee7a",
  );
  assert.equal(fixture.hubspot, undefined);
});

test("matches every pinned raw-file hash", async () => {
  for (const [file, expected] of Object.entries(pinnedHashes)) {
    const bytes = await readFile(new URL(file, rawDir));
    const actual = createHash("sha256").update(bytes).digest("hex");
    assert.equal(actual, expected, `${file} changed from the pinned source`);
  }
});

test("preserves raw values while exposing cleaned values", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const contact = fixture.salesforce.contacts[0];

  assert.match(contact.phoneRaw, /\(/);
  assert.match(contact.phoneE164, /^\+\d+$/);
  assert.ok(fixture.quality.normalizedPhones > 0);
  assert.ok(fixture.quality.contactsMissingReservationStatus > 0);
  assert.ok(fixture.quality.leadsMissingIndustry > 0);
});
