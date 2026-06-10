const { all, buildInClause } = require("../db/database");
const env = require("../config/env");
const { AppError } = require("../utils/app-error");
const { getDisplayNameForEntity, normalizeEntityType } = require("./schema.service");

const CONTEXT_KEYS = [
  "accountingIds",
  "billingIds",
  "clearingIds",
  "deliveryIds",
  "paymentIds",
  "salesOrderIds",
];
const GRAPH_CONTEXT_LIMIT = Math.max(1, Number(env.graphContextLimit) || 24);
const GRAPH_PARTNER_LIMIT = Math.max(1, Number(env.graphPartnerLimit) || 3);
const COMPOSITE_ID_SEPARATOR = "::";

function createContext() {
  return Object.fromEntries(CONTEXT_KEYS.map((key) => [key, new Set()]));
}

function addValue(targetSet, value) {
  if (value !== null && value !== undefined && value !== "") {
    targetSet.add(String(value));
  }
}

function toArray(targetSet) {
  return [...targetSet];
}

function createInCondition(columnName, values) {
  const { placeholders, values: normalizedValues } = buildInClause(values);

  if (!normalizedValues.length) {
    return null;
  }

  return {
    clause: `"${columnName}" IN (${placeholders})`,
    params: normalizedValues,
  };
}

function createOrConditions(columns, values) {
  const conditions = columns
    .map((columnName) => createInCondition(columnName, values))
    .filter(Boolean);

  if (!conditions.length) {
    return null;
  }

  return {
    clause: conditions.map((condition) => condition.clause).join(" OR "),
    params: conditions.flatMap((condition) => condition.params),
  };
}

function createCompositeMatchCondition(columnNames, entries) {
  const normalizedEntries = [
    ...new Set(
      entries
        .filter(
          (entry) =>
            Array.isArray(entry) &&
            entry.length === columnNames.length &&
            entry.every((value) => value !== null && value !== undefined && value !== "")
        )
        .map((entry) => entry.map(String).join(COMPOSITE_ID_SEPARATOR))
    ),
  ].map((key) => key.split(COMPOSITE_ID_SEPARATOR));

  if (!normalizedEntries.length) {
    return null;
  }

  const clause = normalizedEntries
    .map(
      () =>
        `(${columnNames.map((columnName) => `"${columnName}" = ?`).join(" AND ")})`
    )
    .join(" OR ");

  return {
    clause,
    params: normalizedEntries.flat(),
  };
}

function clampLimit(value) {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : GRAPH_CONTEXT_LIMIT;
}

function createCompositeId(...parts) {
  return parts.map((part) => String(part)).join(COMPOSITE_ID_SEPARATOR);
}

function parseCompositeId(entityType, entityId, expectedParts) {
  const parts = String(entityId || "").split(COMPOSITE_ID_SEPARATOR);

  if (parts.length !== expectedParts) {
    throw new AppError(400, `Invalid ${entityType} identifier.`);
  }

  return parts;
}

function normalizeItemId(value) {
  return String(value || "").replace(/^0+(?=\d)/, "");
}

async function selectRowsByColumn(tableName, columnName, values) {
  const condition = createInCondition(columnName, values);

  if (!condition) {
    return [];
  }

  return all(`SELECT * FROM "${tableName}" WHERE ${condition.clause}`, condition.params);
}

async function selectDistinctRowsByColumns(tableName, columnNames, values) {
  const condition = createOrConditions(columnNames, values);

  if (!condition) {
    return [];
  }

  return all(`SELECT DISTINCT * FROM "${tableName}" WHERE ${condition.clause}`, condition.params);
}

async function selectRowsByCompositeKeys(tableName, columnNames, entries) {
  const condition = createCompositeMatchCondition(columnNames, entries);

  if (!condition) {
    return [];
  }

  return all(`SELECT DISTINCT * FROM "${tableName}" WHERE ${condition.clause}`, condition.params);
}

async function selectRowsByColumnWithLimit(
  tableName,
  columnName,
  values,
  orderByColumn,
  limit = GRAPH_CONTEXT_LIMIT
) {
  const condition = createInCondition(columnName, values);

  if (!condition) {
    return [];
  }

  return all(
    `
      SELECT DISTINCT *
      FROM "${tableName}"
      WHERE ${condition.clause}
      ORDER BY "${orderByColumn}" DESC
      LIMIT ?
    `,
    [...condition.params, clampLimit(limit)]
  );
}

function getPaymentNodeId(paymentRow) {
  return (
    paymentRow.clearingAccountingDocument ||
    paymentRow.accountingDocument ||
    paymentRow.salesDocument
  );
}

function getBusinessPartnerNodeId(row) {
  return row?.customer || row?.businessPartner;
}

function getSalesOrderItemNodeId(row) {
  return createCompositeId(row.salesOrder, normalizeItemId(row.salesOrderItem));
}

function getSalesOrderScheduleLineNodeId(row) {
  return createCompositeId(
    row.salesOrder,
    normalizeItemId(row.salesOrderItem),
    row.scheduleLine
  );
}

function getDeliveryItemNodeId(row) {
  return createCompositeId(row.deliveryDocument, normalizeItemId(row.deliveryDocumentItem));
}

function getBillingItemNodeId(row) {
  return createCompositeId(row.billingDocument, normalizeItemId(row.billingDocumentItem));
}

function getBusinessPartnerAddressNodeId(row) {
  return createCompositeId(row.businessPartner, row.addressId);
}

function getCustomerCompanyAssignmentNodeId(row) {
  return createCompositeId(row.customer, row.companyCode);
}

function getCustomerSalesAreaAssignmentNodeId(row) {
  return createCompositeId(
    row.customer,
    row.salesOrganization,
    row.distributionChannel,
    row.division
  );
}

function getProductDescriptionNodeId(row) {
  return createCompositeId(row.product, row.language);
}

function getProductPlantNodeId(row) {
  return createCompositeId(row.product, row.plant);
}

function getProductStorageLocationNodeId(row) {
  return createCompositeId(row.product, row.plant, row.storageLocation);
}

function sanitizeNodeDetails(row) {
  if (!row) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null && value !== undefined && value !== "")
  );
}

function createGraphAccumulator() {
  const nodeMap = new Map();
  const linkMap = new Map();

  return {
    addNode(type, entityId, details = null) {
      if (!entityId) {
        return;
      }

      const normalizedEntityId = String(entityId);
      const nodeId = `${type}:${normalizedEntityId}`;
      const nextDetails = sanitizeNodeDetails(details);

      if (!nodeMap.has(nodeId)) {
        nodeMap.set(nodeId, {
          details: nextDetails,
          entityId: normalizedEntityId,
          id: nodeId,
          label: `${getDisplayNameForEntity(type)} ${normalizedEntityId}`,
          type,
        });
        return;
      }

      if (nextDetails) {
        nodeMap.set(nodeId, {
          ...nodeMap.get(nodeId),
          details: {
            ...(nodeMap.get(nodeId).details || {}),
            ...nextDetails,
          },
        });
      }
    },
    addLink(sourceType, sourceId, targetType, targetId) {
      if (!sourceId || !targetId) {
        return;
      }

      const sourceNodeId = `${sourceType}:${sourceId}`;
      const targetNodeId = `${targetType}:${targetId}`;
      const linkId = `${sourceNodeId}->${targetNodeId}`;

      if (!linkMap.has(linkId)) {
        linkMap.set(linkId, {
          source: sourceNodeId,
          target: targetNodeId,
        });
      }
    },
    toJSON() {
      return {
        links: [...linkMap.values()],
        nodes: [...nodeMap.values()],
      };
    },
  };
}

async function fetchSalesOrdersByIds(salesOrderIds) {
  return selectRowsByColumn("sales_order_headers", "salesOrder", salesOrderIds);
}

async function fetchSalesOrderItemsBySalesOrderIds(salesOrderIds) {
  return selectRowsByColumn("sales_order_items", "salesOrder", salesOrderIds);
}

async function fetchScheduleLinesBySalesOrderItems(salesOrderItems) {
  return selectRowsByCompositeKeys(
    "sales_order_schedule_lines",
    ["salesOrder", "salesOrderItem"],
    salesOrderItems.map((item) => [item.salesOrder, item.salesOrderItem])
  );
}

async function fetchDeliveriesByIds(deliveryIds) {
  return selectRowsByColumn("outbound_delivery_headers", "deliveryDocument", deliveryIds);
}

async function fetchDeliveryItemsByDeliveryIds(deliveryIds) {
  return selectRowsByColumn("outbound_delivery_items", "deliveryDocument", deliveryIds);
}

async function fetchBillingsByIds(billingIds) {
  return selectDistinctRowsByColumns(
    "billing_document_headers",
    ["billingDocument", "accountingDocument"],
    billingIds
  );
}

async function fetchBillingItemsByBillingIds(billingIds) {
  return selectRowsByColumn("billing_document_items", "billingDocument", billingIds);
}

async function fetchBillingCancellationsByBillingIds(billingIds) {
  return selectRowsByColumn("billing_document_cancellations", "billingDocument", billingIds);
}

async function fetchAccountingRowsByIds(accountingIds) {
  return selectDistinctRowsByColumns(
    "journal_entry_items_accounts_receivable",
    ["accountingDocument", "clearingAccountingDocument", "referenceDocument"],
    accountingIds
  );
}

async function fetchPaymentsByIds(paymentIds) {
  return selectDistinctRowsByColumns(
    "payments_accounts_receivable",
    ["clearingAccountingDocument", "accountingDocument", "invoiceReference", "salesDocument"],
    paymentIds
  );
}

async function fetchBusinessPartnersByCustomerIds(customerIds) {
  return selectDistinctRowsByColumns(
    "business_partners",
    ["customer", "businessPartner"],
    customerIds
  );
}

async function fetchBusinessPartnerAddressesByPartnerIds(partnerIds) {
  return selectRowsByColumn("business_partner_addresses", "businessPartner", partnerIds);
}

async function fetchCustomerCompanyAssignmentsByCustomerIds(customerIds) {
  return selectRowsByColumn("customer_company_assignments", "customer", customerIds);
}

async function fetchCustomerSalesAreaAssignmentsByCustomerIds(customerIds) {
  return selectRowsByColumn("customer_sales_area_assignments", "customer", customerIds);
}

async function fetchProductsByIds(productIds) {
  return selectRowsByColumn("products", "product", productIds);
}

async function fetchProductDescriptionsByProductIds(productIds) {
  return selectRowsByColumn("product_descriptions", "product", productIds);
}

async function fetchProductPlantsByKeys(productPlantKeys) {
  return selectRowsByCompositeKeys("product_plants", ["product", "plant"], productPlantKeys);
}

async function fetchProductStorageLocationsByKeys(productStorageKeys) {
  return selectRowsByCompositeKeys(
    "product_storage_locations",
    ["product", "plant", "storageLocation"],
    productStorageKeys
  );
}

async function fetchPlantsByIds(plantIds) {
  return selectRowsByColumn("plants", "plant", plantIds);
}

async function fetchDeliveryLinksBySalesOrders(salesOrderIds) {
  const condition = createInCondition("referenceSdDocument", salesOrderIds);

  if (!condition) {
    return [];
  }

  return all(
    `
      SELECT DISTINCT
        "referenceSdDocument" AS salesOrder,
        "deliveryDocument" AS deliveryDocument
      FROM "outbound_delivery_items"
      WHERE ${condition.clause}
    `,
    condition.params
  );
}

async function fetchSalesOrderLinksByDeliveries(deliveryIds) {
  const condition = createInCondition("deliveryDocument", deliveryIds);

  if (!condition) {
    return [];
  }

  return all(
    `
      SELECT DISTINCT
        "deliveryDocument" AS deliveryDocument,
        "referenceSdDocument" AS salesOrder
      FROM "outbound_delivery_items"
      WHERE ${condition.clause}
    `,
    condition.params
  );
}

async function fetchBillingLinksByDeliveries(deliveryIds) {
  const condition = createInCondition("referenceSdDocument", deliveryIds);

  if (!condition) {
    return [];
  }

  return all(
    `
      SELECT DISTINCT
        "referenceSdDocument" AS deliveryDocument,
        "billingDocument" AS billingDocument
      FROM "billing_document_items"
      WHERE ${condition.clause}
    `,
    condition.params
  );
}

async function fetchDeliveryLinksByBillings(billingIds) {
  const condition = createInCondition("billingDocument", billingIds);

  if (!condition) {
    return [];
  }

  return all(
    `
      SELECT DISTINCT
        "billingDocument" AS billingDocument,
        "referenceSdDocument" AS deliveryDocument
      FROM "billing_document_items"
      WHERE ${condition.clause}
    `,
    condition.params
  );
}

async function fetchAccountingRowsByBillingIds(billingIds, accountingIds) {
  const conditions = [];

  if (billingIds.length) {
    conditions.push(createInCondition("referenceDocument", billingIds));
  }

  if (accountingIds.length) {
    conditions.push(createInCondition("accountingDocument", accountingIds));
  }

  const filteredConditions = conditions.filter(Boolean);

  if (!filteredConditions.length) {
    return [];
  }

  return all(
    `
      SELECT DISTINCT *
      FROM "journal_entry_items_accounts_receivable"
      WHERE ${filteredConditions.map((condition) => condition.clause).join(" OR ")}
    `,
    filteredConditions.flatMap((condition) => condition.params)
  );
}

async function fetchPaymentsByAccounting(accountingIds, clearingIds, paymentIds) {
  const conditions = [
    createInCondition("accountingDocument", [...accountingIds, ...paymentIds]),
    createInCondition("clearingAccountingDocument", [...clearingIds, ...paymentIds]),
  ].filter(Boolean);

  if (!conditions.length) {
    return [];
  }

  return all(
    `
      SELECT DISTINCT *
      FROM "payments_accounts_receivable"
      WHERE ${conditions.map((condition) => condition.clause).join(" OR ")}
    `,
    conditions.flatMap((condition) => condition.params)
  );
}

function collectCustomerIdsFromHydratedFlow(hydratedFlow) {
  const customerIds = new Set();

  for (const salesOrder of hydratedFlow.salesOrders) {
    addValue(customerIds, salesOrder.soldToParty);
  }

  for (const billing of hydratedFlow.billingHeaders) {
    addValue(customerIds, billing.soldToParty);
  }

  for (const accountingRow of hydratedFlow.accountingRows) {
    addValue(customerIds, accountingRow.customer);
  }

  for (const payment of hydratedFlow.payments) {
    addValue(customerIds, payment.customer);
  }

  return [...customerIds];
}

function collectPartnerIds(hydratedFlow, limit = GRAPH_PARTNER_LIMIT) {
  const partnerIds = collectCustomerIdsFromHydratedFlow(hydratedFlow);
  return partnerIds.slice(0, limit);
}

function collectProductIds(salesOrderItems, billingItems) {
  const productIds = new Set();

  for (const salesOrderItem of salesOrderItems) {
    addValue(productIds, salesOrderItem.material);
  }

  for (const billingItem of billingItems) {
    addValue(productIds, billingItem.material);
  }

  return [...productIds];
}

function collectPlantIds({
  customerSalesAreaAssignments,
  deliveries,
  deliveryItems,
  productPlants,
  productStorageLocations,
  salesOrderItems,
}) {
  const plantIds = new Set();

  for (const delivery of deliveries) {
    addValue(plantIds, delivery.shippingPoint);
  }

  for (const deliveryItem of deliveryItems) {
    addValue(plantIds, deliveryItem.plant);
  }

  for (const salesOrderItem of salesOrderItems) {
    addValue(plantIds, salesOrderItem.productionPlant);
  }

  for (const customerSalesAreaAssignment of customerSalesAreaAssignments) {
    addValue(plantIds, customerSalesAreaAssignment.supplyingPlant);
  }

  for (const productPlant of productPlants) {
    addValue(plantIds, productPlant.plant);
  }

  for (const productStorageLocation of productStorageLocations) {
    addValue(plantIds, productStorageLocation.plant);
  }

  return [...plantIds];
}

function buildPartnerLookupMaps(businessPartners) {
  const byBusinessPartner = new Map();
  const byCustomer = new Map();

  for (const businessPartner of businessPartners) {
    const nodeId = getBusinessPartnerNodeId(businessPartner);

    if (!nodeId) {
      continue;
    }

    byCustomer.set(nodeId, nodeId);

    if (businessPartner.customer) {
      byCustomer.set(String(businessPartner.customer), nodeId);
    }

    if (businessPartner.businessPartner) {
      byBusinessPartner.set(String(businessPartner.businessPartner), nodeId);
    }
  }

  return {
    byBusinessPartner,
    byCustomer,
  };
}

async function fetchContextSalesOrdersByPartners(partnerIds) {
  return selectRowsByColumnWithLimit(
    "sales_order_headers",
    "soldToParty",
    partnerIds,
    "creationDate"
  );
}

async function fetchContextBillingsByPartners(partnerIds) {
  return selectRowsByColumnWithLimit(
    "billing_document_headers",
    "soldToParty",
    partnerIds,
    "billingDocumentDate"
  );
}

async function fetchContextAccountingByPartners(partnerIds) {
  return selectRowsByColumnWithLimit(
    "journal_entry_items_accounts_receivable",
    "customer",
    partnerIds,
    "postingDate"
  );
}

async function fetchContextPaymentsByPartners(partnerIds) {
  return selectRowsByColumnWithLimit(
    "payments_accounts_receivable",
    "customer",
    partnerIds,
    "postingDate"
  );
}

async function fetchSeedSalesOrderItemsByProduct(productId, options = {}) {
  const params = [productId];
  const conditions = [`"material" = ?`];

  if (options.plantId) {
    conditions.push(`"productionPlant" = ?`);
    params.push(options.plantId);
  }

  if (options.storageLocation) {
    conditions.push(`"storageLocation" = ?`);
    params.push(options.storageLocation);
  }

  return all(
    `
      SELECT DISTINCT *
      FROM "sales_order_items"
      WHERE ${conditions.join(" AND ")}
      ORDER BY "salesOrder" DESC
      LIMIT ?
    `,
    [...params, GRAPH_CONTEXT_LIMIT]
  );
}

async function fetchSeedBillingItemsByProduct(productId) {
  return all(
    `
      SELECT DISTINCT *
      FROM "billing_document_items"
      WHERE "material" = ?
      ORDER BY "billingDocument" DESC
      LIMIT ?
    `,
    [productId, GRAPH_CONTEXT_LIMIT]
  );
}

async function fetchSeedSalesOrderItemsByPlant(plantId, options = {}) {
  const params = [plantId];
  const conditions = [`"productionPlant" = ?`];

  if (options.productId) {
    conditions.push(`"material" = ?`);
    params.push(options.productId);
  }

  if (options.storageLocation) {
    conditions.push(`"storageLocation" = ?`);
    params.push(options.storageLocation);
  }

  return all(
    `
      SELECT DISTINCT *
      FROM "sales_order_items"
      WHERE ${conditions.join(" AND ")}
      ORDER BY "salesOrder" DESC
      LIMIT ?
    `,
    [...params, GRAPH_CONTEXT_LIMIT]
  );
}

async function fetchSeedDeliveryItemsByPlant(plantId) {
  return all(
    `
      SELECT DISTINCT *
      FROM "outbound_delivery_items"
      WHERE "plant" = ?
      ORDER BY "deliveryDocument" DESC
      LIMIT ?
    `,
    [plantId, GRAPH_CONTEXT_LIMIT]
  );
}

async function seedContextFromCustomer(customerId) {
  const context = createContext();
  const [salesOrders, billingHeaders, accountingRows, payments] = await Promise.all([
    fetchContextSalesOrdersByPartners([customerId]),
    fetchContextBillingsByPartners([customerId]),
    fetchContextAccountingByPartners([customerId]),
    fetchContextPaymentsByPartners([customerId]),
  ]);

  for (const salesOrder of salesOrders) {
    addValue(context.salesOrderIds, salesOrder.salesOrder);
  }

  for (const billing of billingHeaders) {
    addValue(context.billingIds, billing.billingDocument);
    addValue(context.accountingIds, billing.accountingDocument);
  }

  for (const accountingRow of accountingRows) {
    addValue(context.accountingIds, accountingRow.accountingDocument);
    addValue(context.clearingIds, accountingRow.clearingAccountingDocument);
    addValue(context.billingIds, accountingRow.referenceDocument);
  }

  for (const payment of payments) {
    addValue(context.paymentIds, getPaymentNodeId(payment));
    addValue(context.accountingIds, payment.accountingDocument);
    addValue(context.clearingIds, payment.clearingAccountingDocument);
  }

  return context;
}

async function seedContextFromProduct(productId, options = {}) {
  const context = createContext();
  const [salesOrderItems, billingItems] = await Promise.all([
    fetchSeedSalesOrderItemsByProduct(productId, options),
    fetchSeedBillingItemsByProduct(productId),
  ]);

  for (const salesOrderItem of salesOrderItems) {
    addValue(context.salesOrderIds, salesOrderItem.salesOrder);
  }

  for (const billingItem of billingItems) {
    addValue(context.billingIds, billingItem.billingDocument);
    addValue(context.deliveryIds, billingItem.referenceSdDocument);
  }

  return context;
}

async function seedContextFromPlant(plantId, options = {}) {
  const context = createContext();
  const [salesOrderItems, deliveryItems] = await Promise.all([
    fetchSeedSalesOrderItemsByPlant(plantId, options),
    fetchSeedDeliveryItemsByPlant(plantId),
  ]);

  for (const salesOrderItem of salesOrderItems) {
    addValue(context.salesOrderIds, salesOrderItem.salesOrder);
  }

  for (const deliveryItem of deliveryItems) {
    addValue(context.deliveryIds, deliveryItem.deliveryDocument);
  }

  return context;
}

async function enrichContextWithRelatedPartners(context, hydratedFlow) {
  const partnerIds = collectPartnerIds(hydratedFlow);

  if (!partnerIds.length) {
    return;
  }

  const [salesOrders, billingHeaders, accountingRows, payments] = await Promise.all([
    fetchContextSalesOrdersByPartners(partnerIds),
    fetchContextBillingsByPartners(partnerIds),
    fetchContextAccountingByPartners(partnerIds),
    fetchContextPaymentsByPartners(partnerIds),
  ]);

  for (const salesOrder of salesOrders) {
    addValue(context.salesOrderIds, salesOrder.salesOrder);
  }

  for (const billing of billingHeaders) {
    addValue(context.billingIds, billing.billingDocument);
    addValue(context.accountingIds, billing.accountingDocument);
  }

  for (const accountingRow of accountingRows) {
    addValue(context.accountingIds, accountingRow.accountingDocument);
    addValue(context.clearingIds, accountingRow.clearingAccountingDocument);
    addValue(context.billingIds, accountingRow.referenceDocument);
  }

  for (const payment of payments) {
    addValue(context.paymentIds, getPaymentNodeId(payment));
    addValue(context.accountingIds, payment.accountingDocument);
    addValue(context.clearingIds, payment.clearingAccountingDocument);
  }
}

async function resolveSeedContext(entityType, entityId) {
  if (entityType === "sales_order") {
    const context = createContext();
    addValue(context.salesOrderIds, entityId);
    return context;
  }

  if (entityType === "sales_order_item") {
    const [salesOrder] = parseCompositeId(entityType, entityId, 2);
    const context = createContext();
    addValue(context.salesOrderIds, salesOrder);
    return context;
  }

  if (entityType === "sales_order_schedule_line") {
    const [salesOrder] = parseCompositeId(entityType, entityId, 3);
    const context = createContext();
    addValue(context.salesOrderIds, salesOrder);
    return context;
  }

  if (entityType === "delivery") {
    const context = createContext();
    addValue(context.deliveryIds, entityId);
    return context;
  }

  if (entityType === "delivery_item") {
    const [deliveryDocument] = parseCompositeId(entityType, entityId, 2);
    const context = createContext();
    addValue(context.deliveryIds, deliveryDocument);
    return context;
  }

  if (entityType === "billing") {
    const context = createContext();
    addValue(context.billingIds, entityId);
    return context;
  }

  if (entityType === "billing_item") {
    const [billingDocument] = parseCompositeId(entityType, entityId, 2);
    const context = createContext();
    addValue(context.billingIds, billingDocument);
    return context;
  }

  if (entityType === "billing_cancellation") {
    const context = createContext();
    addValue(context.billingIds, entityId);
    return context;
  }

  if (entityType === "accounting") {
    const context = createContext();
    addValue(context.accountingIds, entityId);
    return context;
  }

  if (entityType === "payment") {
    const context = createContext();
    addValue(context.paymentIds, entityId);
    addValue(context.clearingIds, entityId);
    return context;
  }

  if (entityType === "business_partner") {
    return seedContextFromCustomer(entityId);
  }

  if (entityType === "business_partner_address") {
    const [businessPartner] = parseCompositeId(entityType, entityId, 2);
    return seedContextFromCustomer(businessPartner);
  }

  if (entityType === "customer_company_assignment") {
    const [customer] = parseCompositeId(entityType, entityId, 2);
    return seedContextFromCustomer(customer);
  }

  if (entityType === "customer_sales_area_assignment") {
    const [customer] = parseCompositeId(entityType, entityId, 4);
    return seedContextFromCustomer(customer);
  }

  if (entityType === "product") {
    return seedContextFromProduct(entityId);
  }

  if (entityType === "product_description") {
    const [product] = parseCompositeId(entityType, entityId, 2);
    return seedContextFromProduct(product);
  }

  if (entityType === "product_plant") {
    const [product, plant] = parseCompositeId(entityType, entityId, 2);
    return seedContextFromProduct(product, { plantId: plant });
  }

  if (entityType === "product_storage_location") {
    const [product, plant, storageLocation] = parseCompositeId(entityType, entityId, 3);
    return seedContextFromProduct(product, {
      plantId: plant,
      storageLocation,
    });
  }

  if (entityType === "plant") {
    return seedContextFromPlant(entityId);
  }

  throw new AppError(400, `Unsupported entity type: ${entityType}`);
}

async function enrichUpstreamContext(context) {
  if (context.paymentIds.size) {
    const payments = await fetchPaymentsByIds(toArray(context.paymentIds));

    for (const payment of payments) {
      addValue(context.clearingIds, payment.clearingAccountingDocument);
      addValue(context.accountingIds, payment.accountingDocument);
    }
  }

  if (context.accountingIds.size || context.clearingIds.size) {
    const accountingRows = await fetchAccountingRowsByIds([
      ...toArray(context.accountingIds),
      ...toArray(context.clearingIds),
    ]);

    for (const row of accountingRows) {
      addValue(context.accountingIds, row.accountingDocument);
      addValue(context.clearingIds, row.clearingAccountingDocument);
      addValue(context.billingIds, row.referenceDocument);
    }

    const billingHeaders = await fetchBillingsByIds(toArray(context.accountingIds));

    for (const billing of billingHeaders) {
      addValue(context.billingIds, billing.billingDocument);
    }
  }

  if (context.billingIds.size) {
    const deliveryLinks = await fetchDeliveryLinksByBillings(toArray(context.billingIds));

    for (const link of deliveryLinks) {
      addValue(context.deliveryIds, link.deliveryDocument);
    }
  }

  if (context.deliveryIds.size) {
    const salesOrderLinks = await fetchSalesOrderLinksByDeliveries(toArray(context.deliveryIds));

    for (const link of salesOrderLinks) {
      addValue(context.salesOrderIds, link.salesOrder);
    }
  }
}

async function hydrateFlow(context) {
  const salesOrderLinks = await fetchDeliveryLinksBySalesOrders(toArray(context.salesOrderIds));

  for (const link of salesOrderLinks) {
    addValue(context.deliveryIds, link.deliveryDocument);
  }

  const billingLinks = await fetchBillingLinksByDeliveries(toArray(context.deliveryIds));

  for (const link of billingLinks) {
    addValue(context.billingIds, link.billingDocument);
  }

  const billingHeaders = await fetchBillingsByIds(toArray(context.billingIds));

  for (const billing of billingHeaders) {
    addValue(context.accountingIds, billing.accountingDocument);
  }

  const accountingRows = await fetchAccountingRowsByBillingIds(
    toArray(context.billingIds),
    toArray(context.accountingIds)
  );

  for (const row of accountingRows) {
    addValue(context.accountingIds, row.accountingDocument);
    addValue(context.clearingIds, row.clearingAccountingDocument);
  }

  const payments = await fetchPaymentsByAccounting(
    toArray(context.accountingIds),
    toArray(context.clearingIds),
    toArray(context.paymentIds)
  );

  for (const payment of payments) {
    addValue(context.paymentIds, getPaymentNodeId(payment));
  }

  return {
    accountingRows,
    billingHeaders,
    billingLinks,
    deliveries: await fetchDeliveriesByIds(toArray(context.deliveryIds)),
    payments,
    salesOrderLinks,
    salesOrders: await fetchSalesOrdersByIds(toArray(context.salesOrderIds)),
  };
}

async function hydrateRelatedRecords(hydratedFlow) {
  const salesOrderItems = await fetchSalesOrderItemsBySalesOrderIds(
    hydratedFlow.salesOrders.map((salesOrder) => salesOrder.salesOrder)
  );
  const [salesOrderScheduleLines, deliveryItems, billingItems, billingCancellations] =
    await Promise.all([
      fetchScheduleLinesBySalesOrderItems(salesOrderItems),
      fetchDeliveryItemsByDeliveryIds(
        hydratedFlow.deliveries.map((delivery) => delivery.deliveryDocument)
      ),
      fetchBillingItemsByBillingIds(
        hydratedFlow.billingHeaders.map((billing) => billing.billingDocument)
      ),
      fetchBillingCancellationsByBillingIds(
        hydratedFlow.billingHeaders.map((billing) => billing.billingDocument)
      ),
    ]);

  const customerIds = collectCustomerIdsFromHydratedFlow(hydratedFlow);
  const [
    businessPartners,
    customerCompanyAssignments,
    customerSalesAreaAssignments,
  ] = await Promise.all([
    fetchBusinessPartnersByCustomerIds(customerIds),
    fetchCustomerCompanyAssignmentsByCustomerIds(customerIds),
    fetchCustomerSalesAreaAssignmentsByCustomerIds(customerIds),
  ]);
  const businessPartnerAddresses = await fetchBusinessPartnerAddressesByPartnerIds(
    businessPartners
      .map((businessPartner) => businessPartner.businessPartner)
      .filter(Boolean)
  );

  const productIds = collectProductIds(salesOrderItems, billingItems);
  const [products, productDescriptions] = await Promise.all([
    fetchProductsByIds(productIds),
    fetchProductDescriptionsByProductIds(productIds),
  ]);
  const productPlantKeys = salesOrderItems.map((salesOrderItem) => [
    salesOrderItem.material,
    salesOrderItem.productionPlant,
  ]);
  const productPlants = await fetchProductPlantsByKeys(productPlantKeys);
  const productStorageLocations = await fetchProductStorageLocationsByKeys(
    salesOrderItems.map((salesOrderItem) => [
      salesOrderItem.material,
      salesOrderItem.productionPlant,
      salesOrderItem.storageLocation,
    ])
  );
  const plants = await fetchPlantsByIds(
    collectPlantIds({
      customerSalesAreaAssignments,
      deliveries: hydratedFlow.deliveries,
      deliveryItems,
      productPlants,
      productStorageLocations,
      salesOrderItems,
    })
  );

  return {
    billingCancellations,
    billingItems,
    businessPartnerAddresses,
    businessPartners,
    customerCompanyAssignments,
    customerSalesAreaAssignments,
    deliveryItems,
    plants,
    productDescriptions,
    productPlants,
    productStorageLocations,
    products,
    salesOrderItems,
    salesOrderScheduleLines,
  };
}

function addBillingAccountingLinks(graph, billingHeaders, accountingRows) {
  for (const billing of billingHeaders) {
    if (billing.billingDocument && billing.accountingDocument) {
      graph.addLink("billing", billing.billingDocument, "accounting", billing.accountingDocument);
    }
  }

  for (const accountingRow of accountingRows) {
    if (accountingRow.referenceDocument && accountingRow.accountingDocument) {
      graph.addLink(
        "billing",
        accountingRow.referenceDocument,
        "accounting",
        accountingRow.accountingDocument
      );
    }
  }
}

function addAccountingPaymentLinks(graph, accountingRows, payments) {
  for (const payment of payments) {
    const paymentId = getPaymentNodeId(payment);

    if (!paymentId) {
      continue;
    }

    graph.addNode("payment", paymentId);
  }

  for (const accountingRow of accountingRows) {
    if (!accountingRow.accountingDocument) {
      continue;
    }

    if (accountingRow.clearingAccountingDocument) {
      graph.addLink(
        "accounting",
        accountingRow.accountingDocument,
        "payment",
        accountingRow.clearingAccountingDocument
      );
    }
  }

  for (const payment of payments) {
    const paymentId = getPaymentNodeId(payment);

    if (!paymentId || !payment.accountingDocument) {
      continue;
    }

    graph.addLink("accounting", payment.accountingDocument, "payment", paymentId);
  }
}

function addBusinessPartnerNodesAndLinks(graph, hydratedFlow, relatedRecords) {
  const partnerLookup = buildPartnerLookupMaps(relatedRecords.businessPartners);

  relatedRecords.businessPartners.forEach((businessPartner) =>
    graph.addNode("business_partner", getBusinessPartnerNodeId(businessPartner), businessPartner)
  );
  relatedRecords.businessPartnerAddresses.forEach((address) =>
    graph.addNode(
      "business_partner_address",
      getBusinessPartnerAddressNodeId(address),
      address
    )
  );
  relatedRecords.customerCompanyAssignments.forEach((assignment) =>
    graph.addNode(
      "customer_company_assignment",
      getCustomerCompanyAssignmentNodeId(assignment),
      assignment
    )
  );
  relatedRecords.customerSalesAreaAssignments.forEach((assignment) =>
    graph.addNode(
      "customer_sales_area_assignment",
      getCustomerSalesAreaAssignmentNodeId(assignment),
      assignment
    )
  );

  for (const address of relatedRecords.businessPartnerAddresses) {
    const partnerNodeId =
      partnerLookup.byBusinessPartner.get(String(address.businessPartner)) ||
      String(address.businessPartner);
    graph.addLink(
      "business_partner",
      partnerNodeId,
      "business_partner_address",
      getBusinessPartnerAddressNodeId(address)
    );
  }

  for (const assignment of relatedRecords.customerCompanyAssignments) {
    const partnerNodeId =
      partnerLookup.byCustomer.get(String(assignment.customer)) || String(assignment.customer);
    graph.addLink(
      "business_partner",
      partnerNodeId,
      "customer_company_assignment",
      getCustomerCompanyAssignmentNodeId(assignment)
    );
  }

  for (const assignment of relatedRecords.customerSalesAreaAssignments) {
    const partnerNodeId =
      partnerLookup.byCustomer.get(String(assignment.customer)) || String(assignment.customer);
    graph.addLink(
      "business_partner",
      partnerNodeId,
      "customer_sales_area_assignment",
      getCustomerSalesAreaAssignmentNodeId(assignment)
    );
  }

  for (const salesOrder of hydratedFlow.salesOrders) {
    if (!salesOrder.soldToParty) {
      continue;
    }

    const partnerNodeId =
      partnerLookup.byCustomer.get(String(salesOrder.soldToParty)) ||
      String(salesOrder.soldToParty);
    graph.addLink("business_partner", partnerNodeId, "sales_order", salesOrder.salesOrder);
  }

  for (const billing of hydratedFlow.billingHeaders) {
    if (!billing.soldToParty) {
      continue;
    }

    const partnerNodeId =
      partnerLookup.byCustomer.get(String(billing.soldToParty)) || String(billing.soldToParty);
    graph.addLink("business_partner", partnerNodeId, "billing", billing.billingDocument);
  }

  for (const accountingRow of hydratedFlow.accountingRows) {
    if (!accountingRow.customer) {
      continue;
    }

    const partnerNodeId =
      partnerLookup.byCustomer.get(String(accountingRow.customer)) ||
      String(accountingRow.customer);
    graph.addLink(
      "business_partner",
      partnerNodeId,
      "accounting",
      accountingRow.accountingDocument
    );
  }

  for (const payment of hydratedFlow.payments) {
    const paymentId = getPaymentNodeId(payment);

    if (!paymentId || !payment.customer) {
      continue;
    }

    const partnerNodeId =
      partnerLookup.byCustomer.get(String(payment.customer)) || String(payment.customer);
    graph.addLink("business_partner", partnerNodeId, "payment", paymentId);
  }
}

function addSalesOrderDetailNodesAndLinks(graph, relatedRecords) {
  relatedRecords.salesOrderItems.forEach((salesOrderItem) =>
    graph.addNode("sales_order_item", getSalesOrderItemNodeId(salesOrderItem), salesOrderItem)
  );
  relatedRecords.salesOrderScheduleLines.forEach((scheduleLine) =>
    graph.addNode(
      "sales_order_schedule_line",
      getSalesOrderScheduleLineNodeId(scheduleLine),
      scheduleLine
    )
  );

  for (const salesOrderItem of relatedRecords.salesOrderItems) {
    graph.addLink(
      "sales_order",
      salesOrderItem.salesOrder,
      "sales_order_item",
      getSalesOrderItemNodeId(salesOrderItem)
    );
  }

  for (const scheduleLine of relatedRecords.salesOrderScheduleLines) {
    graph.addLink(
      "sales_order_item",
      createCompositeId(
        scheduleLine.salesOrder,
        normalizeItemId(scheduleLine.salesOrderItem)
      ),
      "sales_order_schedule_line",
      getSalesOrderScheduleLineNodeId(scheduleLine)
    );
  }
}

function addDeliveryDetailNodesAndLinks(graph, relatedRecords) {
  relatedRecords.deliveryItems.forEach((deliveryItem) =>
    graph.addNode("delivery_item", getDeliveryItemNodeId(deliveryItem), deliveryItem)
  );

  for (const deliveryItem of relatedRecords.deliveryItems) {
    graph.addLink(
      "delivery",
      deliveryItem.deliveryDocument,
      "delivery_item",
      getDeliveryItemNodeId(deliveryItem)
    );

    if (deliveryItem.referenceSdDocument && deliveryItem.referenceSdDocumentItem) {
      graph.addLink(
        "sales_order_item",
        createCompositeId(
          deliveryItem.referenceSdDocument,
          normalizeItemId(deliveryItem.referenceSdDocumentItem)
        ),
        "delivery_item",
        getDeliveryItemNodeId(deliveryItem)
      );
    }
  }
}

function addBillingDetailNodesAndLinks(graph, relatedRecords) {
  relatedRecords.billingItems.forEach((billingItem) =>
    graph.addNode("billing_item", getBillingItemNodeId(billingItem), billingItem)
  );
  relatedRecords.billingCancellations.forEach((billingCancellation) =>
    graph.addNode(
      "billing_cancellation",
      billingCancellation.billingDocument,
      billingCancellation
    )
  );

  for (const billingItem of relatedRecords.billingItems) {
    graph.addLink(
      "billing",
      billingItem.billingDocument,
      "billing_item",
      getBillingItemNodeId(billingItem)
    );

    if (billingItem.referenceSdDocument && billingItem.referenceSdDocumentItem) {
      graph.addLink(
        "delivery_item",
        createCompositeId(
          billingItem.referenceSdDocument,
          normalizeItemId(billingItem.referenceSdDocumentItem)
        ),
        "billing_item",
        getBillingItemNodeId(billingItem)
      );
    }
  }

  for (const billingCancellation of relatedRecords.billingCancellations) {
    graph.addLink(
      "billing",
      billingCancellation.billingDocument,
      "billing_cancellation",
      billingCancellation.billingDocument
    );
  }
}

function addProductAndPlantNodesAndLinks(graph, hydratedFlow, relatedRecords) {
  relatedRecords.products.forEach((product) => graph.addNode("product", product.product, product));
  relatedRecords.productDescriptions.forEach((productDescription) =>
    graph.addNode(
      "product_description",
      getProductDescriptionNodeId(productDescription),
      productDescription
    )
  );
  relatedRecords.productPlants.forEach((productPlant) =>
    graph.addNode("product_plant", getProductPlantNodeId(productPlant), productPlant)
  );
  relatedRecords.productStorageLocations.forEach((productStorageLocation) =>
    graph.addNode(
      "product_storage_location",
      getProductStorageLocationNodeId(productStorageLocation),
      productStorageLocation
    )
  );
  relatedRecords.plants.forEach((plant) => graph.addNode("plant", plant.plant, plant));

  for (const productDescription of relatedRecords.productDescriptions) {
    graph.addLink(
      "product",
      productDescription.product,
      "product_description",
      getProductDescriptionNodeId(productDescription)
    );
  }

  for (const productPlant of relatedRecords.productPlants) {
    graph.addLink("product", productPlant.product, "product_plant", getProductPlantNodeId(productPlant));
    graph.addLink("plant", productPlant.plant, "product_plant", getProductPlantNodeId(productPlant));
  }

  for (const productStorageLocation of relatedRecords.productStorageLocations) {
    graph.addLink(
      "product_plant",
      createCompositeId(productStorageLocation.product, productStorageLocation.plant),
      "product_storage_location",
      getProductStorageLocationNodeId(productStorageLocation)
    );
    graph.addLink(
      "plant",
      productStorageLocation.plant,
      "product_storage_location",
      getProductStorageLocationNodeId(productStorageLocation)
    );
  }

  for (const salesOrderItem of relatedRecords.salesOrderItems) {
    if (salesOrderItem.material) {
      graph.addLink(
        "product",
        salesOrderItem.material,
        "sales_order_item",
        getSalesOrderItemNodeId(salesOrderItem)
      );
    }

    if (salesOrderItem.productionPlant) {
      graph.addLink(
        "plant",
        salesOrderItem.productionPlant,
        "sales_order_item",
        getSalesOrderItemNodeId(salesOrderItem)
      );
    }

    if (
      salesOrderItem.material &&
      salesOrderItem.productionPlant &&
      salesOrderItem.storageLocation
    ) {
      graph.addLink(
        "sales_order_item",
        getSalesOrderItemNodeId(salesOrderItem),
        "product_storage_location",
        createCompositeId(
          salesOrderItem.material,
          salesOrderItem.productionPlant,
          salesOrderItem.storageLocation
        )
      );
    }
  }

  for (const deliveryItem of relatedRecords.deliveryItems) {
    if (deliveryItem.plant) {
      graph.addLink(
        "plant",
        deliveryItem.plant,
        "delivery_item",
        getDeliveryItemNodeId(deliveryItem)
      );
    }
  }

  for (const delivery of hydratedFlow.deliveries) {
    if (delivery.shippingPoint) {
      graph.addLink("plant", delivery.shippingPoint, "delivery", delivery.deliveryDocument);
    }
  }

  for (const billingItem of relatedRecords.billingItems) {
    if (billingItem.material) {
      graph.addLink(
        "product",
        billingItem.material,
        "billing_item",
        getBillingItemNodeId(billingItem)
      );
    }
  }

  for (const customerSalesAreaAssignment of relatedRecords.customerSalesAreaAssignments) {
    if (customerSalesAreaAssignment.supplyingPlant) {
      graph.addLink(
        "plant",
        customerSalesAreaAssignment.supplyingPlant,
        "customer_sales_area_assignment",
        getCustomerSalesAreaAssignmentNodeId(customerSalesAreaAssignment)
      );
    }
  }
}

async function buildGraph(entity, id) {
  const entityType = normalizeEntityType(entity);
  const entityId = String(id || "").trim();

  if (!entityType) {
    throw new AppError(400, "A supported entity type is required.");
  }

  if (!entityId) {
    throw new AppError(400, "An entity id is required.");
  }

  const context = await resolveSeedContext(entityType, entityId);
  await enrichUpstreamContext(context);
  let hydratedFlow = await hydrateFlow(context);
  await enrichContextWithRelatedPartners(context, hydratedFlow);
  hydratedFlow = await hydrateFlow(context);

  const relatedRecords = await hydrateRelatedRecords(hydratedFlow);
  const graph = createGraphAccumulator();

  hydratedFlow.salesOrders.forEach((salesOrder) =>
    graph.addNode("sales_order", salesOrder.salesOrder, salesOrder)
  );
  hydratedFlow.deliveries.forEach((delivery) =>
    graph.addNode("delivery", delivery.deliveryDocument, delivery)
  );
  hydratedFlow.billingHeaders.forEach((billing) =>
    graph.addNode("billing", billing.billingDocument, billing)
  );
  hydratedFlow.accountingRows.forEach((row) =>
    graph.addNode("accounting", row.accountingDocument, row)
  );
  hydratedFlow.payments.forEach((payment) =>
    graph.addNode("payment", getPaymentNodeId(payment), payment)
  );

  hydratedFlow.salesOrderLinks.forEach((link) => {
    graph.addLink("sales_order", link.salesOrder, "delivery", link.deliveryDocument);
  });
  hydratedFlow.billingLinks.forEach((link) => {
    graph.addLink("delivery", link.deliveryDocument, "billing", link.billingDocument);
  });
  addBillingAccountingLinks(graph, hydratedFlow.billingHeaders, hydratedFlow.accountingRows);
  addAccountingPaymentLinks(graph, hydratedFlow.accountingRows, hydratedFlow.payments);
  addBusinessPartnerNodesAndLinks(graph, hydratedFlow, relatedRecords);
  addSalesOrderDetailNodesAndLinks(graph, relatedRecords);
  addDeliveryDetailNodesAndLinks(graph, relatedRecords);
  addBillingDetailNodesAndLinks(graph, relatedRecords);
  addProductAndPlantNodesAndLinks(graph, hydratedFlow, relatedRecords);

  const result = graph.toJSON();

  if (!result.nodes.length) {
    throw new AppError(404, `No graph data found for ${entityType} ${entityId}.`);
  }

  return result;
}

module.exports = {
  buildGraph,
};
