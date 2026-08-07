// TypeScript API for the ZoomInfo gatekeeper.
//
// ZoomInfo is a B2B go-to-market (GTM) intelligence service. This gatekeeper exposes a single
// "whole-account" resource: a session scoped to one connected ZoomInfo account's OAuth grant and
// entitlements. Through it a Gadget can:
//
//   * Resolve controlled filter values and discoverable enrich fields (`lookup*`).
//   * Search ZoomInfo's data — companies, contacts, intent signals, scoops, and news (`search*`).
//   * Enrich matched records into full detail (`enrich*`). Enrichment consumes credits.
//   * Fetch AI/recommendation surfaces — lookalikes, contact recommendations, account summaries,
//     and account insights (`find*`, `get*`, `ask*`).
//
// The canonical ZoomInfo workflow this API is shaped around is "search, then enrich":
//   1. `lookup(...)` maps natural-language criteria (e.g. "Computer Software") to the controlled
//      values ZoomInfo's filters require.
//   2. `searchCompanies(...)` / `searchContacts(...)` return ranked, lightweight matches carrying
//      stable ZoomInfo IDs. Search is free — it consumes no credits.
//   3. `enrichCompanies(...)` / `enrichContacts(...)` turn those IDs into full records, spending
//      credits (see each method).
//
// Enrichment is a two-step flow: an `enrich*` call returns an `EnrichmentTicket` handle right away,
// and the enriched data is fetched separately with `getEnrichmentResult(ticket)`. The result may
// not be available immediately, and an enrichment might not run at all — so treat the ticket as a
// claim check and read the outcome when you need the data (see `getEnrichmentResult`).

import type { RpcTarget } from "cloudflare:workers";

// ===========================================================================
// Session
// ===========================================================================

/**
 * Whole-account access to a connected ZoomInfo account. Every method is scoped to the account's
 * OAuth grant and package entitlements: ZoomInfo never returns fields or datasets the account is
 * not entitled to.
 */
export interface ZoomInfoSession extends RpcTarget {
  // -------------------------------------------------------------------------
  // Lookup — resolve controlled values & discover enrich fields
  // -------------------------------------------------------------------------

  /**
   * Resolve the valid controlled values for a ZoomInfo taxonomy (industries, job functions,
   * management levels, metro regions, intent topics, technologies, scoop topics, etc.).
   *
   * Call this before a `search*` whenever the user supplies natural-language criteria, so filters
   * receive values ZoomInfo recognizes. Free; consumes no credits. Results are cached per connected
   * account (~24h) since taxonomies rarely change.
   *
   * @param fieldName Which taxonomy to resolve.
   * @param filters Optional narrowing filters, only meaningful for hashtag/technology taxonomies
   *   (`category`, `parentCategory`, `subCategory`, `vendor`).
   */
  lookup(fieldName: LookupFieldName, filters?: LookupFilters): Promise<LookupValue[]>;

  /**
   * Discover the input or output fields available for an enrich entity, including whether the
   * connected account is entitled to each. Use this to pick valid `outputFields` for the
   * `enrich*` methods. Free; consumes no credits.
   *
   * @param entity Which enrich entity's fields to describe.
   * @param fieldType `"input"` (match criteria fields) or `"output"` (returnable fields).
   */
  lookupEnrichFields(
    entity: EnrichEntity,
    fieldType: "input" | "output",
  ): Promise<EnrichFieldInfo[]>;

  // -------------------------------------------------------------------------
  // Companies
  // -------------------------------------------------------------------------

  /**
   * Search ZoomInfo companies by firmographic / technographic criteria. Returns ranked, lightweight
   * matches (name, website, coarse location, stable ZoomInfo company ID). Free; consumes no credits.
   * Pass the returned `id`s to `enrichCompanies` for full detail.
   */
  searchCompanies(
    criteria: CompanySearchCriteria,
    page?: PageRequest,
  ): Promise<SearchPage<CompanyMatch>>;

  /**
   * Enrich up to 25 companies into full records, selecting which `outputFields` to return. Returns
   * a ticket; fetch the enriched records with `getEnrichmentResult(ticket)`.
   *
   * Cost: one credit per newly-enriched record; already-owned records and no-match/error results
   * are free.
   *
   * @param inputs 1–25 match specs (by `companyId` — best — or by name/website/other hints).
   * @param outputFields Fields to return. Discover entitled fields via
   *   `lookupEnrichFields("company", "output")`.
   */
  enrichCompanies(
    inputs: CompanyEnrichInput[],
    outputFields: CompanyOutputField[],
  ): Promise<EnrichmentTicket>;

  /**
   * Enrich the corporate hierarchy (parentage + full family tree of subsidiaries, acquisitions,
   * former names, and locations) for up to 25 companies. Returns a ticket; fetch the records with
   * `getEnrichmentResult(ticket)`.
   *
   * Cost: one credit per matched record; already-owned records are free.
   *
   * @param inputs 1–25 match specs (by `companyId`, `companyName`, or `companyWebsite`).
   * @param outputFields Fields to return (`parentage`, `familyTree`, `companyId`); also
   *   discoverable via `lookupEnrichFields("corporate-hierarchy", "output")`.
   */
  enrichCorporateHierarchy(
    inputs: CompanyRefInput[],
    outputFields: CorporateHierarchyOutputField[],
  ): Promise<EnrichmentTicket>;

  /**
   * Fetch ZoomInfo hashtags (categorical business labels) for a single company. Returns a ticket;
   * fetch the hashtags with `getEnrichmentResult(ticket)`.
   *
   * Cost: one credit for the company.
   *
   * @param companyId ZoomInfo company ID.
   */
  enrichHashtags(companyId: string): Promise<EnrichmentTicket>;

  // -------------------------------------------------------------------------
  // Contacts
  // -------------------------------------------------------------------------

  /**
   * Search ZoomInfo contacts (people) by person and/or company criteria. Returns ranked,
   * lightweight matches (name, title, company, stable contact ID, availability flags). Free.
   * Pass the returned `id`s to `enrichContacts` for full detail (email, phone, …).
   */
  searchContacts(
    criteria: ContactSearchCriteria,
    page?: PageRequest,
  ): Promise<SearchPage<ContactMatch>>;

  /**
   * Enrich up to 25 contacts into full records, selecting which `outputFields` to return. Returns a
   * ticket; fetch the enriched records with `getEnrichmentResult(ticket)`.
   *
   * Cost: one credit per newly-enriched record; already-owned records and no-match/error results
   * are free.
   *
   * @param inputs 1–25 match specs (by `personId` — best — or by name + company hints).
   * @param outputFields Fields to return. Discover via `lookupEnrichFields("contact", "output")`.
   * @param requiredFields Only return a contact that has a non-empty value for each of these
   *   fields (e.g. `["email"]` to require a deliverable email).
   */
  enrichContacts(
    inputs: ContactEnrichInput[],
    outputFields: ContactOutputField[],
    requiredFields?: ContactOutputField[],
  ): Promise<EnrichmentTicket>;

  // -------------------------------------------------------------------------
  // Intent
  // -------------------------------------------------------------------------

  /**
   * Search buyer-intent signals across ZoomInfo companies for one or more intent topics. Each
   * signal ties a company to a topic with a signal score and audience strength. Free.
   * Resolve topics via `lookup("intent-topics")`.
   */
  searchIntent(
    criteria: IntentSearchCriteria,
    page?: PageRequest,
  ): Promise<SearchPage<IntentSignal>>;

  /**
   * Retrieve intent signals for a single company across one or more topics, with optional
   * top-signal-location detail. Returns a ticket; fetch the signals with
   * `getEnrichmentResult(ticket)`.
   *
   * Cost: one credit for the company; each returned signal counts as a record.
   */
  enrichIntent(
    criteria: IntentEnrichCriteria,
    page?: PageRequest,
  ): Promise<EnrichmentTicket>;

  // -------------------------------------------------------------------------
  // Scoops
  // -------------------------------------------------------------------------

  /**
   * Search ZoomInfo Scoops — sourced business insights (projects, initiatives, personnel moves,
   * etc.) tied to companies and contacts. Free (each scoop counts as a record).
   * Resolve topic/type/department values via `lookup("scoop-topics" | "scoop-types" |
   * "scoop-departments")`.
   */
  searchScoops(
    criteria: ScoopSearchCriteria,
    page?: PageRequest,
  ): Promise<SearchPage<Scoop>>;

  /**
   * Retrieve Scoops for a single company. Returns a ticket; fetch the scoops with
   * `getEnrichmentResult(ticket)`.
   *
   * Cost: one credit for the company; each returned scoop counts as a record.
   */
  enrichScoops(
    criteria: ScoopEnrichCriteria,
    page?: PageRequest,
  ): Promise<EnrichmentTicket>;

  // -------------------------------------------------------------------------
  // News
  // -------------------------------------------------------------------------

  /**
   * Search ZoomInfo-curated news articles by category, URL, and publish-date range. Free (each
   * article counts as a record). Resolve categories via `lookup("news-categories")`.
   */
  searchNews(
    criteria: NewsSearchCriteria,
    page?: PageRequest,
  ): Promise<SearchPage<NewsArticle>>;

  /**
   * Retrieve news articles for a single company. Returns a ticket; fetch the articles with
   * `getEnrichmentResult(ticket)`.
   *
   * Cost: one credit for the company; each returned article counts as a record.
   */
  enrichNews(
    criteria: NewsEnrichCriteria,
    page?: PageRequest,
  ): Promise<EnrichmentTicket>;

  // -------------------------------------------------------------------------
  // Enrichment results
  // -------------------------------------------------------------------------

  /**
   * Fetch the outcome of an enrichment, identified by the ticket returned from an `enrich*` method.
   * Free; safe to poll.
   *
   * The outcome is one of: `"pending"` (not available yet — poll again), `"ready"` (the enriched
   * payload is available), `"rejected"` (the enrichment did not run; no credits spent), or
   * `"failed"` (ZoomInfo returned an error). On a `"ready"` outcome, narrow on `kind` (see
   * `EnrichmentReady`) to get the correctly-typed `result`.
   *
   * @param ticket The ticket returned by the `enrich*` call.
   */
  getEnrichmentResult(ticket: EnrichmentTicket): Promise<EnrichmentOutcome>;

  // -------------------------------------------------------------------------
  // Recommendations & lookalikes (Copilot)
  // -------------------------------------------------------------------------

  /**
   * Find companies similar to a reference company, ranked by an ML similarity model. Free.
   * Provide `companyId` (best) or `companyName`. Optional boolean filters restrict lookalikes to
   * companies sharing an attribute with the reference (same revenue range / country / industry /
   * employee range).
   */
  findSimilarCompanies(criteria: SimilarCompaniesCriteria): Promise<CompanyLookalike[]>;

  /**
   * Find contacts similar to a reference person, ranked by an ML similarity model. Free.
   * Optionally constrain to a target company.
   */
  findContactLookalikes(criteria: ContactLookalikesCriteria): Promise<ContactLookalike[]>;

  /**
   * Get ranked contact recommendations at a target company for a given sales motion (use case),
   * derived from the account's past ZoomInfo interactions. Free.
   */
  getContactRecommendations(
    criteria: ContactRecommendationsCriteria,
  ): Promise<ContactRecommendation[]>;

  // -------------------------------------------------------------------------
  // Account intelligence (Copilot)
  // -------------------------------------------------------------------------

  /**
   * Get an AI-generated Markdown account summary for a company. Free.
   * @param companyId ZoomInfo company ID.
   */
  getAccountSummary(companyId: string): Promise<AccountSummary>;

  /**
   * Ask a free-form question about a company's account summary; returns an AI-generated answer.
   * Free.
   * @param companyId ZoomInfo company ID.
   * @param question The natural-language question.
   */
  askAccountSummary(companyId: string, question: string): Promise<string>;

  /**
   * Retrieve curated sales-intelligence insight signals (funding, leadership changes, intent
   * spikes, hiring anomalies, WebSights, G2/TrustRadius activity, etc.) for up to 50 companies,
   * optionally filtered to specific signal types. Free.
   */
  getCompanyInsights(criteria: CompanyInsightsCriteria): Promise<CompanyInsights[]>;

  // -------------------------------------------------------------------------
  // Usage
  // -------------------------------------------------------------------------

  /**
   * Report the connected account's current API usage and limits (request, record, uniqueID, and
   * WebSights counters), so a Gadget can decide whether an enrich operation is affordable before
   * spending. Free.
   *
   * This is the authoritative source for credit accounting: to know exactly what an enrich cost,
   * read the `record` counter before and after. Do not sum `EnrichResult.creditCharged`, which is
   * an upper bound that can over-count records ZoomInfo served for free.
   */
  getCreditUsage(): Promise<CreditUsage>;
}

// ===========================================================================
// Pagination
// ===========================================================================

/** Which page of results to fetch, and how to sort. ZoomInfo pages are 1-indexed. */
export type PageRequest = {
  /** 1-indexed page number. Defaults to 1. */
  page?: number;
  /** Results per page, 1–100. Defaults to 25. */
  pageSize?: number;
  /**
   * Sort field, optionally prefixed with `-` for descending. Valid values are endpoint-specific;
   * see each `search*` method's ZoomInfo docs. Ignored by endpoints that don't support sorting.
   */
  sort?: string;
};

/** One page of results plus enough metadata to page through the rest. */
export type SearchPage<T> = {
  /** The items on this page, in ranked/sorted order. */
  results: T[];
  /** Total number of items across all pages for this query. */
  totalResults: number;
  /** The 1-indexed page number these results came from. */
  page: number;
  /** The page size used for this query. */
  pageSize: number;
  /** True if further pages exist. */
  hasMore: boolean;
};

// ===========================================================================
// Lookup
// ===========================================================================

/** A ZoomInfo controlled-vocabulary taxonomy that `lookup` can resolve. */
export type LookupFieldName =
  | "board-members"
  | "buying-groups"
  | "company-rankings"
  | "company-types"
  | "continents"
  | "countries"
  | "departments"
  | "employee-count"
  | "hashtags"
  | "industries"
  | "intent-topics"
  | "job-functions"
  | "job-titles"
  | "management-levels"
  | "metro-regions"
  | "naics-codes"
  | "news-categories"
  | "revenue-ranges"
  | "scoop-departments"
  | "scoop-topics"
  | "scoop-types"
  | "sic-codes"
  | "states"
  | "sub-unit-types"
  | "tech-categories"
  | "tech-products"
  | "tech-skills"
  | "tech-vendors"
  | "years-of-experience";

/** Optional narrowing filters for `lookup`; only meaningful for hashtag/technology taxonomies. */
export type LookupFilters = {
  category?: string;
  parentCategory?: string;
  subCategory?: string;
  vendor?: string;
};

/** One controlled value within a taxonomy. */
export type LookupValue = {
  /** The value to pass into a search/enrich filter (e.g. an industry code or metro-region id). */
  id: string;
  /** ZoomInfo resource type for this value (e.g. "Industry", "JobFunction"). */
  type: string;
  /** Human-readable display name, when present. */
  name?: string;
  /**
   * Any additional taxonomy-specific attributes (e.g. intent-topics carry `category`,
   * `department`, `jobFunction`, `description`; job-titles carry `order`). Shape varies by
   * taxonomy.
   */
  attributes?: Record<string, unknown>;
};

/** Enrich entities whose fields can be discovered via `lookupEnrichFields`. */
export type EnrichEntity =
  | "company"
  | "contact"
  | "scoop"
  | "news"
  | "intent"
  | "technology"
  | "hashtag"
  | "orgChart"
  | "corporate-hierarchy";

/** Description of one enrich input/output field. */
export type EnrichFieldInfo = {
  /** Field name to use in `outputFields`/match input. */
  fieldName: string;
  /** Human-readable description of the field. */
  description: string;
  /** Data type of the field (e.g. "String", "Long"). */
  fieldType?: string;
  /** For input fields: whether the account is entitled to it. Undefined for output fields. */
  accessGranted?: boolean;
};

// ===========================================================================
// Shared filter blocks
// ===========================================================================

/**
 * Company firmographic / technographic filters. Used directly (flattened) by company search and
 * nested under `company` by contact search; intent and scoop search take the identity-free
 * `SignalCompanyFilters` subset instead. All fields optional and combined with AND. Numeric
 * revenue/funding/budget values are in THOUSANDS of USD unless noted. Comma-separated string fields
 * accept multiple values.
 */
export type CompanyFilters = {
  /** ZoomInfo company ID(s), comma-separated. */
  companyId?: string;
  /** Company name. */
  companyName?: string;
  /** Company website URL(s) in http://www.example.com format, comma-separated. */
  companyWebsite?: string;
  /** Stock ticker symbol(s). */
  companyTicker?: string[];
  /** Company description; space-separated words. */
  companyDescription?: string;
  /** Company type(s) (private, public, …), comma-separated. */
  companyType?: string;
  /** Full company address. */
  address?: string;
  /** Street portion of the company address. */
  street?: string;
  /**
   * State/province (US/Canada). Do NOT also set `country`: ZoomInfo ignores `state` when `country`
   * is present and returns the whole country, so passing both is rejected. `state` already scopes
   * to the US/Canada, so use it alone.
   */
  state?: string;
  /** Zip/postal code. */
  zipCode?: string;
  /** Country of the primary address. Mutually exclusive with `state` (see `state`). */
  country?: string;
  /** Continent of the primary address. */
  continent?: string;
  /** Radius (miles) from `zipCode`; one of 10, 25, 50, 100, 250. */
  zipCodeRadiusMiles?: number;
  /** Company hashtags, comma-separated. */
  hashTagString?: string;
  /** Technology product tags, comma-separated. */
  techAttributeTagList?: string;
  /** Exclude companies with these technology product tags; supports AND/OR logic. */
  excludeTechAttributeTagList?: string;
  /** Require `industryCodes` to match a company's PRIMARY industry. Default false. */
  primaryIndustriesOnly?: boolean;
  /** Company sub types (division, subsidiary); use with `parentId`/`ultimateParentId`. */
  subUnitTypes?: string;
  /** Top-level industry codes, comma-separated (resolve via `lookup("industries")`). */
  industryCodes?: string;
  /** Industry keywords with AND/OR operators (e.g. "software AND security"). */
  industryKeywords?: string;
  /** SIC codes, comma-separated. */
  sicCodes?: string;
  /** NAICS codes, comma-separated. */
  naicsCodes?: string;
  /** Annual revenue range(s) in USD, comma-separated (resolve via `lookup("revenue-ranges")`). */
  revenue?: string;
  /** Minimum annual revenue, USD thousands. */
  revenueMin?: number;
  /** Maximum annual revenue, USD thousands. */
  revenueMax?: number;
  /** Minimum employee count. */
  employeeRangeMin?: string;
  /** Maximum employee count. */
  employeeRangeMax?: string;
  /** Pre-defined employee-count range(s), comma-separated. */
  employeeCount?: string;
  /** Company ranking IDs (e.g. Fortune 500), comma-separated. */
  companyRanking?: string;
  /** US/Canada metro area(s), comma-separated (resolve via `lookup("metro-regions")`). */
  metroRegion?: string;
  /** Location match type: PersonOrHQ, PersonAndHQ, Person, HQ, PersonThenHQ. */
  locationSearchType?: string;
  /** Minimum funding amount, thousands. */
  fundingAmountMin?: number;
  /** Maximum funding amount, thousands. */
  fundingAmountMax?: number;
  /** Funding range start date, YYYY-MM-DD. */
  fundingStartDate?: string;
  /** Funding range end date, YYYY-MM-DD. */
  fundingEndDate?: string;
  /** Minimum number of ZoomInfo contacts at the company. */
  zoominfoContactsMin?: string;
  /** Maximum number of ZoomInfo contacts at the company. */
  zoominfoContactsMax?: string;
  /** US/Canada states/metros to exclude, comma-separated. */
  excludedRegions?: string;
  /** Company hierarchical structure sub-unit types to include, comma-separated
   *  (UNSPECIFIED, LOCATION, DIVISION, ACQUISITION, SUBSIDIARY, FORMER_NEW_NAME). */
  companyStructureIncludedSubUnitTypes?: string;
  /** Minimum 1-year employee growth rate. */
  oneYearEmployeeGrowthRateMin?: string;
  /** Maximum 1-year employee growth rate. */
  oneYearEmployeeGrowthRateMax?: string;
  /** Minimum 2-year employee growth rate. */
  twoYearEmployeeGrowthRateMin?: string;
  /** Maximum 2-year employee growth rate. */
  twoYearEmployeeGrowthRateMax?: string;
  /** Parent company ZoomInfo ID. */
  parentId?: string;
  /** Ultimate parent company ZoomInfo ID. */
  ultimateParentId?: string;
  /** Engagement start date, YYYY-MM-DD. */
  engagementStartDate?: string;
  /** Engagement end date, YYYY-MM-DD (requires `engagementStartDate`). */
  engagementEndDate?: string;
  /** Engagement type(s): email, phone, online meeting. */
  engagementType?: string[];
  /** Business model(s): B2C, B2B, B2G. Default All. */
  businessModel?: string[];
  /** Return whether each record is under management. */
  underManagement?: boolean;
};

/**
 * Company-search-only filters that don't apply when company filters are nested inside another
 * entity's search. Combined with `CompanyFilters` by `searchCompanies`.
 */
export type CompanyOnlyFilters = {
  /** ZoomInfo-certified (activity confirmed within 12 months): 1 = certified, 0 = not. */
  certified?: number;
  /** Exclude defunct companies. Default false. */
  excludeDefunctCompanies?: boolean;
  /** Minimum marketing-department budget, thousands. */
  marketingDepartmentBudgetMin?: number;
  /** Maximum marketing-department budget, thousands. */
  marketingDepartmentBudgetMax?: number;
  /** Minimum finance-department budget, thousands. */
  financeDepartmentBudgetMin?: number;
  /** Maximum finance-department budget, thousands. */
  financeDepartmentBudgetMax?: number;
  /** Minimum IT-department budget, thousands. */
  itDepartmentBudgetMin?: number;
  /** Maximum IT-department budget, thousands. */
  itDepartmentBudgetMax?: number;
  /** Minimum HR-department budget, thousands. */
  hrDepartmentBudgetMin?: number;
  /** Maximum HR-department budget, thousands. */
  hrDepartmentBudgetMax?: number;
};

/**
 * Company firmographic filters accepted by intent- and scoop-signal search. These search endpoints
 * filter by firmographics only and reject company-identity inputs (`companyId`, `companyName`,
 * `companyWebsite`): they answer "which companies show this signal", not "show me this signal for a
 * specific company". To pull intent or scoops for a company you already know, use `enrichIntent` /
 * `enrichScoops`, which take a company identifier.
 */
export type SignalCompanyFilters = Omit<CompanyFilters, "companyId" | "companyName" | "companyWebsite">;

/**
 * Person-level contact filters, shared (nested under `contact`) by contact and scoop search. All
 * optional, combined with AND, and matched against the contact's current company unless noted.
 */
export type ContactFilters = {
  /** ZoomInfo contact ID(s), comma-separated. */
  personId?: string;
  /** Contact email address. */
  emailAddress?: string;
  /** Hashed email (MD5/SHA1/SHA256/SHA512). */
  hashedEmail?: string;
  /** Supplemental email address(es). */
  supplementalEmail?: string[];
  /** Direct/mobile phone number(s); match any. */
  phone?: string[];
  /** Full name. */
  fullName?: string;
  /** First name. */
  firstName?: string;
  /** Middle initial. */
  middleInitial?: string;
  /** Last name. */
  lastName?: string;
  /** Job title(s); OR for multiple. */
  jobTitle?: string;
  /** Job title(s), exact-match; OR for multiple. */
  exactJobTitle?: string;
  /** Job title(s) to exclude, comma-separated. */
  excludeJobTitle?: string;
  /** Management level(s) at current employer. */
  managementLevel?: string;
  /** Management level(s) to exclude, comma-separated. */
  excludeManagementLevel?: string;
  /** Department(s) at current employer, comma-separated. */
  department?: string;
  /** Job function at current employer. */
  jobFunction?: string;
  /** Board-member handling: include, exclude, only. Default exclude. */
  boardMember?: string;
  /** Include partial profiles. Default false (excluded). */
  excludePartialProfiles?: boolean;
  /** Executives only. Default false. */
  executivesOnly?: boolean;
  /** Fields that must be present (email, phone, directPhone, personalEmail, mobilePhone). */
  requiredFields?: string;
  /** Minimum contact accuracy score (70–99). */
  contactAccuracyScoreMin?: string;
  /** Maximum contact accuracy score (70–99). */
  contactAccuracyScoreMax?: string;
  /** Months since the profile was last updated. */
  lastUpdatedInMonths?: number;
  /** Only contacts updated after this date, YYYY-MM-DD. */
  lastUpdatedDateAfter?: string;
  /** Only contacts validated after this date, YYYY-MM-DD. */
  validDateAfter?: string;
  /** Notified-contact handling: include, exclude, only. Default include. */
  hasBeenNotified?: string;
  /** Company relationship: present (default), past, pastAndPresent. */
  companyPastOrPresent?: string;
  /** School name. */
  school?: string;
  /** Education degree. */
  degree?: string;
  /** Contact location company ID(s). */
  locationCompanyId?: number[];
  /** Total years of experience, comma-separated. */
  yearsOfExperience?: string;
  /** Minimum date the contact began current employment, YYYY-MM-DD. */
  positionStartDateMin?: string;
  /** Maximum date the contact began current employment, YYYY-MM-DD. */
  positionStartDateMax?: string;
  /** Web references (OR logic; letters/numbers only). */
  webReferences?: string[];
  /** Buying group ID (only one allowed). */
  buyingGroup?: string[];
  /** Technology skill IDs (OR logic; resolve via `lookup("tech-skills")`). */
  techSkills?: string[];
  /** Past employment criteria (max 5); matches ANY. */
  employmentHistory?: { companyName: string; jobTitle: string }[];
  /** Return whether each record is under management. */
  underManagement?: boolean;
};

// ===========================================================================
// Company search / enrich
// ===========================================================================

/** Company search filters: the full firmographic block plus company-search-only filters. */
export type CompanySearchCriteria = CompanyFilters & CompanyOnlyFilters;

/** A lightweight company match from `searchCompanies`. */
export type CompanyMatch = {
  /** Stable ZoomInfo company ID — pass this to `enrichCompanies`. */
  id: string;
  /** Company name. */
  name: string;
  /** Company website, if known. */
  website?: string;
  /** City of the primary address, if known. */
  city?: string;
  /** State/province of the primary address, if known. */
  state?: string;
  /** Country of the primary address, if known. */
  country?: string;
  /** Approximate yearly revenue, USD thousands (as a string), if known. */
  revenue?: string;
  /** Approximate employee count (as a string), if known. */
  employeeCount?: string;
  /** Logo URL, if known. */
  logoUrl?: string;
};

/** Match spec for `enrichCompanies`. Provide `companyId` when known; otherwise supply hints. */
export type CompanyEnrichInput = {
  /** Stable ZoomInfo company ID (best; from `searchCompanies`). */
  companyId?: string;
  /** Company name hint. */
  companyName?: string;
  /** Company website hint (http://www.example.com). */
  companyWebsite?: string;
  /** Stock ticker hint. */
  companyTicker?: string;
  /** HQ phone hint. */
  companyPhone?: string;
  /** HQ fax hint. */
  companyFax?: string;
  /** Street hint. */
  companyStreet?: string;
  /** City hint. */
  companyCity?: string;
  /** State/province hint. */
  companyState?: string;
  /** Zip/postal code hint. */
  companyZipCode?: string;
  /** Country hint. */
  companyCountry?: string;
  /** IP address associated with the company. */
  ipAddress?: string;
};

/** Simple company reference used by `enrichCorporateHierarchy`. */
export type CompanyRefInput = {
  companyId?: string;
  companyName?: string;
  companyWebsite?: string;
};

/**
 * A fully-enriched company record. The concrete keys present depend on the `outputFields`
 * requested and the account's entitlements, so field values live in an open map.
 */
export type CompanyRecord = {
  /** Stable ZoomInfo company ID. */
  id: string;
  /** Requested output fields, keyed by field name. */
  fields: Record<string, unknown>;
};

/** Selectable output fields for `enrichCorporateHierarchy`. */
export type CorporateHierarchyOutputField = "parentage" | "familyTree" | "companyId";

/** An enriched corporate-hierarchy record (parentage + family tree). */
export type CorporateHierarchyRecord = {
  /** Matched ZoomInfo company ID. */
  companyId: string;
  /** Requested output fields (parentage, familyTree, …), keyed by field name. */
  fields: Record<string, unknown>;
};

/** A hashtag (categorical business label) returned by `enrichHashtags`. */
export type CompanyHashtag = {
  /** Hashtag identifier. */
  id: string;
  /** Hashtag label. */
  label?: string;
  /** Display label. */
  displayLabel?: string;
  /** Description of the returned data. */
  description?: string;
  /** Group associated with the hashtag. */
  group?: string;
  /** Parent category. */
  parentCategory?: string;
  /** Priority. */
  priority?: number;
};

/** Selectable output fields for `enrichCompanies`. */
export type CompanyOutputField =
  | "id" | "name" | "website" | "domainList" | "ticker" | "type" | "description"
  | "phone" | "fax" | "street" | "city" | "state" | "zipCode" | "country" | "continent"
  | "metroArea" | "logo" | "alternateLogos" | "socialMediaUrls"
  | "primaryIndustry" | "primaryIndustryCode" | "primarySubIndustryCode" | "industries"
  | "industryCodes" | "sicCodes" | "naicsCodes"
  | "employeeCount" | "employeeRange" | "employeeGrowth" | "employeeCountByDepartment"
  | "revenue" | "revenueRange" | "numberOfContactsInZoomInfo"
  | "companyStatus" | "companyStatusDate" | "isDefunct"
  | "competitors" | "products" | "businessModel" | "foundedYear"
  | "parentId" | "parentName" | "subUnitType" | "subUnitIndustries"
  | "ultimateParentId" | "ultimateParentName" | "ultimateParentRevenue" | "ultimateParentEmployees"
  | "locationCount" | "locationMatch"
  | "lastUpdatedDate" | "createdDate" | "certificationDate" | "certified"
  | "companyFunding" | "recentFundingAmount" | "recentFundingDate" | "totalFundingAmount"
  | "departmentBudgets" | "engagements";

// ===========================================================================
// Contact search / enrich
// ===========================================================================

/** Contact search filters: person-level filters, plus a nested company firmographic block. */
export type ContactSearchCriteria = ContactFilters & {
  /** Company firmographic filters to constrain the contacts' (current) company. */
  company?: CompanyFilters;
};

/** A lightweight contact match from `searchContacts`. */
export type ContactMatch = {
  /** Stable ZoomInfo contact ID — pass this to `enrichContacts`. */
  id: string;
  /** First name. */
  firstName?: string;
  /** Middle name. */
  middleName?: string;
  /** Last name. */
  lastName?: string;
  /** Current job title, if known. */
  jobTitle?: string;
  /** Management level(s), comma-separated, if known. */
  managementLevel?: string;
  /** Reachability likelihood score (75–99), if known. */
  contactAccuracyScore?: number;
  /** Whether ZoomInfo has a work email on file (the address itself requires enrichment). */
  hasEmail?: boolean;
  /** Whether a direct phone is on file. */
  hasDirectPhone?: boolean;
  /** Whether a mobile phone is on file. */
  hasMobilePhone?: boolean;
  /** Employing company, if known. */
  company?: { id: string; name?: string };
};

/** Match spec for `enrichContacts`. Provide `personId` when known; otherwise supply hints. */
export type ContactEnrichInput = {
  /** Stable ZoomInfo contact ID (best; from `searchContacts`). */
  personId?: string;
  /** Full name hint. */
  fullName?: string;
  /** First name hint. */
  firstName?: string;
  /** Last name hint. */
  lastName?: string;
  /** Email hint. */
  emailAddress?: string;
  /** Hashed email hint (MD5/SHA1/SHA256/SHA512). */
  hashedEmail?: string;
  /** Direct/mobile phone hint. */
  phone?: string;
  /** Job title hint. */
  jobTitle?: string;
  /** Social-media URL hint. */
  externalURL?: string;
  /** Employing company ZoomInfo ID hint. */
  companyId?: string;
  /** Employing company name hint. */
  companyName?: string;
  /** Only match if updated after this date, YYYY-MM-DD. */
  lastUpdatedDateAfter?: string;
  /** Only match if validated after this date, YYYY-MM-DD. */
  validDateAfter?: string;
  /** Minimum contact accuracy score (70–99). */
  contactAccuracyScoreMin?: string;
};

/**
 * A fully-enriched contact record. Concrete keys depend on requested `outputFields` and account
 * entitlements, so field values live in an open map.
 */
export type ContactRecord = {
  /** Stable ZoomInfo contact ID. */
  id: string;
  /** Requested output fields, keyed by field name. */
  fields: Record<string, unknown>;
};

/** Selectable output fields for `enrichContacts` (person + employing-company fields). */
export type ContactOutputField =
  | "id" | "firstName" | "middleName" | "lastName" | "salutation" | "suffix"
  | "email" | "emailAlt" | "hasCanadianEmail" | "hashedEmails"
  | "phone" | "directPhoneAlt" | "directPhoneDoNotCall"
  | "mobilePhone" | "mobilePhoneAlt" | "mobilePhoneDoNotCall"
  | "jobTitle" | "jobFunction" | "managementLevel" | "contactAccuracyScore"
  | "street" | "city" | "region" | "metroArea" | "zipCode" | "state" | "country" | "continent"
  | "personHasMoved" | "withinEu" | "withinCalifornia" | "withinCanada"
  | "validDate" | "lastUpdatedDate" | "noticeProvidedDate"
  | "education" | "picture" | "techSkills" | "externalUrls"
  | "employmentHistory" | "locationCompanyId" | "positionStartDate" | "yearsOfExperience"
  | "engagements" | "isDefunct"
  | "companyId" | "companyName" | "companyWebsite" | "companyDescription" | "companyPhone"
  | "companyFax" | "companyStreet" | "companyCity" | "companyState" | "companyZipCode"
  | "companyCountry" | "companyContinent" | "companyLogo" | "companyAlternateLogos"
  | "companySocialMediaUrls" | "companyRevenue" | "companyRevenueNumeric" | "companyRevenueRange"
  | "companyEmployeeCount" | "companyEmployeeRange" | "companyEmployeeGrowth"
  | "companyType" | "companyTicker" | "companyRanking" | "companyDivision"
  | "companyIndustries" | "companyIndustryCodes" | "companyPrimaryIndustry"
  | "companyPrimaryIndustryCode" | "companyPrimarySubIndustryCode"
  | "companySicCodes" | "companyNaicsCodes";

// ===========================================================================
// Enrichment tickets & outcomes
// ===========================================================================

/** Which enrichment operation a ticket refers to. */
export type EnrichmentKind =
  | "companies"
  | "corporateHierarchy"
  | "hashtags"
  | "contacts"
  | "intent"
  | "scoops"
  | "news";

/**
 * Opaque handle for an enrichment. Returned by every `enrich*` method and passed back to
 * `getEnrichmentResult`. `kind` tells you which enrichment it is, which lines up with the `kind`
 * discriminant on the eventual `"ready"` outcome.
 */
export type EnrichmentTicket = {
  /** Identifier for this enrichment. */
  id: number;
  /** Which enrichment operation this ticket refers to. */
  kind: EnrichmentKind;
  /** A short human-readable summary of what was requested. */
  summary: string;
};

/**
 * The enriched payload of a completed enrichment, discriminated by `kind`. Narrow on `kind` to get
 * the correctly-typed result: `EnrichResult<…>[]` for record enrichments, `CompanyHashtag[]` for
 * hashtags, and a `SearchPage<…>` for the intent/scoops/news company feeds.
 */
export type EnrichmentReady =
  | { kind: "companies"; result: EnrichResult<CompanyRecord>[] }
  | { kind: "corporateHierarchy"; result: EnrichResult<CorporateHierarchyRecord>[] }
  | { kind: "hashtags"; result: CompanyHashtag[] }
  | { kind: "contacts"; result: EnrichResult<ContactRecord>[] }
  | { kind: "intent"; result: SearchPage<IntentSignal> }
  | { kind: "scoops"; result: SearchPage<Scoop> }
  | { kind: "news"; result: SearchPage<NewsArticle> };

/**
 * The outcome of an enrichment. `"pending"` while not yet available; `"rejected"` if the
 * enrichment did not run (no credits spent); `"ready"` with the enriched payload (see
 * `EnrichmentReady`); `"failed"` if ZoomInfo returned an error.
 */
export type EnrichmentOutcome =
  | { status: "pending" }
  | { status: "rejected" }
  | { status: "failed"; message: string }
  | ({ status: "ready" } & EnrichmentReady);

// ===========================================================================
// Enrich result envelope
// ===========================================================================

/** ZoomInfo per-record match status for an enrich input. */
export type EnrichMatchStatus =
  | "FULL_MATCH"
  | "NO_MATCH"
  | "NON_MATCH_BY_LAST_UPDATED_DATE"
  | "NON_MATCH_BY_VALID_DATE"
  | "NON_MATCH_BY_REQUIRED_FIELDS"
  | "NON_MATCH_BY_CONTACT_ACCURACY_MIN"
  | "COMPANY_ONLY_MATCH"
  | "CONTACT_ONLY_MATCH"
  | "OPT_OUT"
  | "LIMIT_EXCEEDED"
  | "INVALID_INPUT";

/**
 * One result from an enrich call. Enrichment is best-effort per input: a given input may match,
 * return no match, or error, independently of the others in the batch. Results are returned in
 * input order.
 */
export type EnrichResult<T> =
  | {
      status: "matched";
      /** ZoomInfo match status detail (usually FULL_MATCH; may be a partial-match variant). */
      matchStatus: EnrichMatchStatus;
      /** The enriched record. */
      record: T;
      /**
       * Whether this record likely consumed a credit. This is an upper bound for display only — it
       * reads `true` unless ZoomInfo reports the record as already owned, and ZoomInfo often omits
       * that, so it can over-report. For exact accounting, compare `getCreditUsage()` before and
       * after.
       */
      creditCharged: boolean;
    }
  | {
      status: "noMatch";
      /** ZoomInfo match status detail explaining the non-match. */
      matchStatus: EnrichMatchStatus;
      /** Echo of the input that produced no match, for correlation. */
      input: unknown;
    }
  | {
      status: "error";
      /** Echo of the input that errored, for correlation. */
      input: unknown;
      /** Human-readable error detail from ZoomInfo. */
      message: string;
    };

// ===========================================================================
// Intent
// ===========================================================================

/** Intent-signal search filters. At least one topic is required. */
export type IntentSearchCriteria = {
  /** Intent topics (1–50). Required. Resolve via `lookup("intent-topics")`. */
  topics: string[];
  /** Signal window start, YYYY-MM-DD. */
  signalStartDate?: string;
  /** Signal window end, YYYY-MM-DD. */
  signalEndDate?: string;
  /** Minimum signal score (60–100). */
  signalScoreMin?: number;
  /** Maximum signal score (60–100). */
  signalScoreMax?: number;
  /** Minimum audience strength (A–E, A = larger). */
  audienceStrengthMin?: string;
  /** Maximum audience strength (A–E). */
  audienceStrengthMax?: string;
  /** Include recommended contacts on each signal. Default true. */
  findRecommendedContacts?: boolean;
  /**
   * Company firmographic filters to constrain which companies' signals are returned. Intent search
   * cannot target a company by identity; use `enrichIntent` to pull signals for a known company.
   */
  company?: SignalCompanyFilters;
};

/** Intent-enrich filters for a single company. Provide a company identifier plus topics. */
export type IntentEnrichCriteria = {
  /** Intent topics (1–50). Required. */
  topics: string[];
  /** ZoomInfo company ID. Provide at least one of companyId/companyName/companyWebsite. */
  companyId?: string;
  /** Company name. */
  companyName?: string;
  /** Company website (http://www.example.com), comma-separated. */
  companyWebsite?: string;
  /** Signal window start, YYYY-MM-DD. */
  signalStartDate?: string;
  /** Signal window end, YYYY-MM-DD. */
  signalEndDate?: string;
  /** Minimum signal score (60–100). */
  signalScoreMin?: number;
  /** Maximum signal score (60–100). */
  signalScoreMax?: number;
  /** Minimum audience strength (A–E). */
  audienceStrengthMin?: string;
  /** Maximum audience strength (A–E). */
  audienceStrengthMax?: string;
  /** Include recommended contacts on each signal. Default true. */
  findRecommendedContacts?: boolean;
};

/** A single company-topic buyer-intent signal. */
export type IntentSignal = {
  /** Intent category. */
  category?: string;
  /** The intent topic. */
  topic: string;
  /** Signal score: recent content consumption vs. the company's historical baseline. */
  signalScore: number;
  /** Audience strength (rough size of the researching group). */
  audienceStrength?: string;
  /** Date the signal was identified. */
  signalDate?: string;
  /** Number of signal spikes detected in the queried window. */
  spikesInDateRange?: number;
  /** The company exhibiting the signal. */
  company: {
    id: string;
    name?: string;
    website?: string;
    /** Whether the company is also consuming content on other topics. */
    hasOtherTopicConsumption?: boolean;
  };
  /** Recommended contacts at the company for this signal (when requested). */
  recommendedContacts?: RecommendedContact[];
  /** Up to 3 top signal locations (enrich only). */
  topSignalLocations?: { city?: string; state?: string; country?: string }[];
};

/** A recommended contact attached to an intent signal. */
export type RecommendedContact = {
  id: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  companyName?: string;
  jobFunctions?: { name?: string; department?: string }[];
};

// ===========================================================================
// Scoops
// ===========================================================================

/** Scoop search filters: scoop-specific fields plus nested contact and company blocks. */
export type ScoopSearchCriteria = {
  /** Range start by publication date, YYYY-MM-DD. */
  publishedStartDate?: string;
  /** Range end by publication date, YYYY-MM-DD. */
  publishedEndDate?: string;
  /** Only scoops updated since `publishedStartDate`. Default false. */
  updatedSinceCreation?: boolean;
  /** Scoop type IDs, comma-separated (resolve via `lookup("scoop-types")`). */
  scoopType?: string;
  /** Scoop topic IDs, comma-separated (resolve via `lookup("scoop-topics")`). */
  scoopTopic?: string;
  /** Scoop department (IT, finance, HR, …; resolve via `lookup("scoop-departments")`). */
  department?: string;
  /** ZoomInfo scoop ID(s), comma-separated. */
  scoopId?: string;
  /** Search by description; space-separated words. */
  description?: string;
  /** Business model(s): B2C, B2B, B2G. Default All. */
  businessModel?: string[];
  /** ZoomInfo-certified activity in the past 12 months: 1 = certified, 0 = not. */
  certified?: number;
  /** Person-level filters to constrain associated contacts. */
  contact?: ContactFilters;
  /**
   * Company firmographic filters to constrain associated companies. Scoop search cannot target a
   * company by identity; use `enrichScoops` to pull scoops for a known company.
   */
  company?: SignalCompanyFilters;
};

/** Scoop-enrich filters for a single company. Provide a company identifier. */
export type ScoopEnrichCriteria = {
  /** ZoomInfo company ID. Provide at least one of companyId/companyName/companyWebsite. */
  companyId?: string;
  /** Company name. */
  companyName?: string;
  /** Company website, comma-separated. */
  companyWebsite?: string;
  /** Range start by publication date, YYYY-MM-DD. */
  publishedStartDate?: string;
  /** Range end by publication date, YYYY-MM-DD. */
  publishedEndDate?: string;
  /** Only scoops updated since `publishedStartDate`. Default false. */
  updatedSinceCreation?: boolean;
  /** Scoop type IDs, comma-separated. */
  scoopType?: string;
  /** Scoop topic IDs, comma-separated. */
  scoopTopic?: string;
  /** Scoop department. */
  department?: string;
  /** ZoomInfo scoop ID(s), comma-separated. */
  scoopId?: string;
  /** Search by description; space-separated words. */
  description?: string;
};

/** A ZoomInfo Scoop. */
export type Scoop = {
  /** Scoop ID. */
  id: string;
  /** Published date. */
  publishedDate?: string;
  /** Original published date. */
  originalPublishedDate?: string;
  /** Link text. */
  linkText?: string;
  /** Scoop URL. */
  link?: string;
  /** Scoop description. */
  description?: string;
  /** Text for an updated scoop. */
  updateText?: string;
  /** Scoop topics. */
  topics?: { id: string; topic: string }[];
  /** Scoop types. */
  types?: { id: string; type: string }[];
  /** Associated company. */
  company?: { id: string; name?: string };
  /** Associated contacts. */
  contacts?: {
    id: string;
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    jobFunction?: { name?: string; department?: string }[];
  }[];
};

// ===========================================================================
// News
// ===========================================================================

/** News search filters. All optional, but at least one must be set. */
export type NewsSearchCriteria = {
  /** News categories (resolve via `lookup("news-categories")`). */
  categories?: string[];
  /** News URL strings (min 5 chars each). */
  url?: string[];
  /** Earliest publish date, YYYY-MM-DD. */
  pageDateMin?: string;
  /** Latest publish date, YYYY-MM-DD. */
  pageDateMax?: string;
};

/** News-enrich filters for a single company. */
export type NewsEnrichCriteria = {
  /** ZoomInfo company ID (company identifier required). */
  companyId?: string;
  /** Company name. */
  companyName?: string;
  /** Company website. */
  companyWebsite?: string;
  /** News categories. */
  categories?: string[];
  /** News URL strings (min 5 chars each). */
  url?: string[];
  /** Earliest publish date, YYYY-MM-DD. */
  pageDateMin?: string;
  /** Latest publish date, YYYY-MM-DD. */
  pageDateMax?: string;
};

/** A ZoomInfo-curated news article. */
export type NewsArticle = {
  /** News source domain. */
  domain?: string;
  /** Article title. */
  title?: string;
  /** Full article URL. */
  url?: string;
  /** Article image URL. */
  imageUrl?: string;
  /** Publish date. */
  pageDate?: string;
  /** Assigned categories. */
  categories?: string[];
  /** Summary/body. */
  description?: string;
  /** Associated companies. */
  company?: { id: string; name?: string }[];
};

// ===========================================================================
// Recommendations & lookalikes
// ===========================================================================

/** Filters for `findSimilarCompanies`. Provide `companyId` (best) or `companyName`. */
export type SimilarCompaniesCriteria = {
  /** ZoomInfo ID of the reference company. */
  companyId?: string;
  /** Reference company name (required if `companyId` absent). */
  companyName?: string;
  /** Restrict lookalikes to the same revenue range. */
  sameRevenueRange?: boolean;
  /** Restrict lookalikes to the same country. */
  sameCountry?: boolean;
  /** Restrict lookalikes to the same industry. */
  sameIndustry?: boolean;
  /** Restrict lookalikes to the same employee range. */
  sameEmployeeRange?: boolean;
  /** Max results, 1–100. Default 25. */
  limit?: number;
};

/** A company lookalike result, ranked by similarity. */
export type CompanyLookalike = {
  /** Result ID. */
  id: string;
  /** Lookalike company name. */
  companyName: string;
  /** Similarity score (0–1; higher = more similar). */
  score: number;
  /** Rank (1 = most similar). */
  rank: number;
  /** Primary industry. */
  industry?: string;
  /** Revenue range. */
  revenueRange?: string;
  /** Employee-count range. */
  employeeRange?: string;
  /** HQ country. */
  country?: string;
};

/** Filters for `findContactLookalikes`. */
export type ContactLookalikesCriteria = {
  /** ZoomInfo person ID of the reference person. Required. */
  referencePersonId: string;
  /** Constrain search to this company; if omitted, search all companies. */
  targetCompanyId?: string;
  /** Max results, 1–100. Default 25. */
  limit?: number;
};

/** A contact lookalike result, ranked by similarity. */
export type ContactLookalike = {
  /** Result ID. */
  id: string;
  /** Rank (1 = most similar). */
  rank: number;
  /** Similarity score (0–1). */
  score: number;
  /** Brief description of the lookalike contact. */
  lookalikePersonBrief?: string;
  /** Reference person ID used. */
  referencePersonId?: string;
  /** Brief description of the reference person. */
  referencePersonBrief?: string;
};

/** Sales-motion use case for `getContactRecommendations`. */
export type RecommendationUseCase = "PROSPECTING" | "DEAL_ACCELERATION" | "RENEWAL_AND_GROWTH";

/** Filters for `getContactRecommendations`. */
export type ContactRecommendationsCriteria = {
  /** Sales motion. Required. */
  useCaseType: RecommendationUseCase;
  /** Target ZoomInfo company ID. Required. */
  companyId: string;
  /** Max results, 1–100. Default 25. */
  limit?: number;
};

/** A recommended contact at a target company. */
export type ContactRecommendation = {
  /** Result ID. */
  id: string;
  /** Rank (1 = most relevant). */
  rank: number;
  /** Similarity score (may exceed 1.0). */
  score: number;
  /** ML re-ranking score; -1.0 if the model didn't run. */
  reRankingScore?: number;
  /** Profile brief (absent if unavailable). */
  recommendedPersonBrief?: string;
  /** Interaction source that produced the recommendation. */
  sourceType?: string;
  /** Reference person ID. */
  referencePersonId?: string;
  /** Reference person profile brief. */
  referencePersonBrief?: string;
};

// ===========================================================================
// Account intelligence
// ===========================================================================

/** An AI-generated account summary. */
export type AccountSummary = {
  /** ZoomInfo company ID the summary is for. */
  companyId: string;
  /** Markdown content summarizing account-related data. */
  markdown: string;
};

/** Filters for `getCompanyInsights`. */
export type CompanyInsightsCriteria = {
  /** ZoomInfo company IDs to retrieve insights for (max 50). Required. */
  companyIds: string[];
  /** Filter to specific insight signal types; omit/empty for all types. */
  signalTypes?: InsightSignalType[];
};

/** Insight signal types (see ZoomInfo Signals Glossary). */
export type InsightSignalType =
  | "zi.funding" | "zi.cxochange" | "zi.scoop" | "zi.websights"
  | "zi.buyingcommitteechange" | "zi.account-level-intent.spike" | "zi.intent.competitor.spike"
  | "zi.mpocchange" | "zi.g2" | "zi.trustradius" | "zi.anomaloushiring" | "zi.formcomplete"
  | "zi.podcastmentions" | "zi.marketingcampaigns" | "zi.technology" | "zi.seniorjobpostings"
  | "zi.personwebsights" | "zi.personbasednews" | "zi.wondeal"
  | "zi.newcontactpreviouslyworkedforcustomer" | "zi.personchange" | "zi.upcomingmeeting"
  | "zi.lowactivecontacts" | "zi.nodecisionmaker" | "zi.nopostmeetingfollowup"
  | "zi.upcomingrenewal" | "zi.m&a" | "zi.productlaunch" | "zi.earnings" | "zi.partnership"
  | "zi.layoffs" | "zi.painpoint" | "zi.divestiture" | "zi.ipo" | "zi.award" | "zi.project";

/** The insights for one company. */
export type CompanyInsights = {
  /** ZoomInfo company ID. */
  companyId: string;
  /** The insight signals for this company. */
  insights: Insight[];
};

/**
 * A single insight signal. The common envelope is typed; `signalPayload` is type-specific and
 * left as an open map keyed by `signalType` (see ZoomInfo docs for each payload shape).
 */
export type Insight = {
  /** Unique insight ID. */
  id: string;
  /** Company ID. */
  ziCompanyId: string;
  /** Signal ID. */
  signalId: string;
  /** Signal type discriminator (e.g. "zi.funding"). */
  signalType: string;
  /** Type-specific payload; shape depends on `signalType`. */
  signalPayload: Record<string, unknown>;
  /** Date of the insight. */
  insightDate?: string;
  /** Expiration date. */
  expiresAt?: string;
  /** Creation date. */
  createdAt?: string;
};

// ===========================================================================
// Usage
// ===========================================================================

/** One usage/limit counter for the connected account. */
export type UsageLimit = {
  /** Limit type: "request", "record", "uniqueID", "webSightsApiRequest", or "webSightsApiRecord". */
  limitType: string;
  /** Human-readable description of the limit type. */
  description?: string;
  /** The subscribed total for this limit over the contract period. */
  totalLimit?: number;
  /** How much of this limit has already been used. */
  currentUsage?: number;
  /** How much of this limit remains before additional purchase is required. */
  usageRemaining?: number;
};

/** Snapshot of the connected account's API usage and limits, one entry per counter. */
export type CreditUsage = {
  /** Per-counter usage/limit entries. */
  usage: UsageLimit[];
};
