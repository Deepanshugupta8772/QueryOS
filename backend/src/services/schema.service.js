const { DATASET_SCHEMA, ENTITY_ALIASES } = require("../db/schema");

const DISPLAY_NAMES = {
  business_partner: "Business Partner",
  business_partner_address: "Partner Address",
  customer_company_assignment: "Customer Company Assignment",
  customer_sales_area_assignment: "Customer Sales Area Assignment",
  sales_order: "Sales Order",
  sales_order_item: "Sales Order Item",
  sales_order_schedule_line: "Schedule Line",
  delivery: "Delivery",
  delivery_item: "Delivery Item",
  billing: "Billing",
  billing_item: "Billing Item",
  billing_cancellation: "Billing Cancellation",
  accounting: "Accounting",
  payment: "Payment",
  product: "Product",
  product_description: "Product Description",
  product_plant: "Product Plant",
  product_storage_location: "Storage Location",
  plant: "Plant",
};

const schemaLines = Object.entries(DATASET_SCHEMA).map(([tableName, definition]) => {
  return `${tableName}(${definition.columns.join(", ")}) -- ${definition.description}`;
});

const relationshipLines = [
  "business_partners.businessPartner = business_partner_addresses.businessPartner",
  "business_partners.customer = customer_company_assignments.customer",
  "business_partners.customer = customer_sales_area_assignments.customer",
  "sales_order_headers.salesOrder = sales_order_items.salesOrder",
  "sales_order_items.(salesOrder, salesOrderItem) = sales_order_schedule_lines.(salesOrder, salesOrderItem)",
  "sales_order_headers.salesOrder = outbound_delivery_items.referenceSdDocument",
  "sales_order_items.(salesOrder, salesOrderItem) = outbound_delivery_items.(referenceSdDocument, referenceSdDocumentItem)",
  "outbound_delivery_headers.deliveryDocument = outbound_delivery_items.deliveryDocument",
  "outbound_delivery_headers.deliveryDocument = billing_document_items.referenceSdDocument",
  "outbound_delivery_items.(deliveryDocument, deliveryDocumentItem) = billing_document_items.(referenceSdDocument, referenceSdDocumentItem)",
  "billing_document_headers.billingDocument = billing_document_items.billingDocument",
  "billing_document_headers.billingDocument = billing_document_cancellations.billingDocument",
  "billing_document_headers.billingDocument = journal_entry_items_accounts_receivable.referenceDocument",
  "billing_document_headers.accountingDocument = journal_entry_items_accounts_receivable.accountingDocument",
  "journal_entry_items_accounts_receivable.clearingAccountingDocument = payments_accounts_receivable.clearingAccountingDocument",
  "business_partners.customer = sales_order_headers.soldToParty",
  "business_partners.customer = billing_document_headers.soldToParty",
  "business_partners.customer = journal_entry_items_accounts_receivable.customer",
  "business_partners.customer = payments_accounts_receivable.customer",
  "products.product = product_descriptions.product",
  "products.product = product_plants.product",
  "product_plants.(product, plant) = product_storage_locations.(product, plant)",
  "sales_order_items.material = products.product",
  "billing_document_items.material = products.product",
  "plants.plant = sales_order_items.productionPlant",
  "plants.plant = outbound_delivery_items.plant",
  "plants.plant = product_plants.plant",
  "plants.plant = customer_sales_area_assignments.supplyingPlant",
];

const schemaPrompt = `${schemaLines.join("\n")}\n\nRelationships:\n${relationshipLines.join("\n")}`;

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeEntityType(input) {
  const normalizedInput = normalizeToken(input);

  for (const [entityType, aliases] of Object.entries(ENTITY_ALIASES)) {
    const normalizedAliases = aliases.map(normalizeToken);

    if (normalizedInput === entityType || normalizedAliases.includes(normalizedInput)) {
      return entityType;
    }
  }

  return null;
}

function getSchemaPrompt() {
  return schemaPrompt;
}

function getKnownTableNames() {
  return Object.keys(DATASET_SCHEMA);
}

function getDisplayNameForEntity(entityType) {
  return DISPLAY_NAMES[entityType] || entityType;
}

module.exports = {
  getDisplayNameForEntity,
  getKnownTableNames,
  getSchemaPrompt,
  normalizeEntityType,
};
