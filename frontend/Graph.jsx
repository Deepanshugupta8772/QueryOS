import axios from "axios";
import ForceGraph from "force-graph";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const DEFAULT_GRAPH = {
  links: [],
  nodes: [],
};
const ENTITY_TITLES = {
  accounting: "Journal Entry",
  billing: "Billing Document",
  billing_cancellation: "Billing Cancellation",
  billing_item: "Billing Item",
  business_partner: "Business Partner",
  business_partner_address: "Partner Address",
  customer_company_assignment: "Customer Company",
  customer_sales_area_assignment: "Customer Sales Area",
  delivery: "Outbound Delivery",
  delivery_item: "Delivery Item",
  payment: "Payment",
  plant: "Plant",
  product: "Product",
  product_description: "Product Description",
  product_plant: "Product Plant",
  product_storage_location: "Storage Location",
  sales_order: "Sales Order",
  sales_order_item: "Sales Order Item",
  sales_order_schedule_line: "Schedule Line",
};
const PROCESS_LEVELS = {
  business_partner: 0,
  business_partner_address: 1,
  customer_company_assignment: 1,
  plant: 1,
  product: 1,
  customer_sales_area_assignment: 2,
  product_description: 2,
  product_plant: 2,
  sales_order: 3,
  sales_order_item: 4,
  delivery: 5,
  product_storage_location: 5,
  sales_order_schedule_line: 5,
  delivery_item: 6,
  billing: 7,
  billing_cancellation: 8,
  billing_item: 8,
  accounting: 9,
  payment: 10,
};
const MAX_VISIBLE_DETAIL_ENTRIES = 8;
const NODE_COLORS = {
  accounting: "#8b5cf6",
  billing: "#ef4444",
  billing_cancellation: "#f87171",
  billing_item: "#fca5a5",
  business_partner: "#3b82f6",
  business_partner_address: "#60a5fa",
  customer_company_assignment: "#93c5fd",
  customer_sales_area_assignment: "#bfdbfe",
  delivery: "#f59e0b",
  delivery_item: "#fbbf24",
  payment: "#a78bfa",
  plant: "#fb923c",
  product: "#14b8a6",
  product_description: "#5eead4",
  product_plant: "#2dd4bf",
  product_storage_location: "#99f6e4",
  sales_order: "#10b981",
  sales_order_item: "#34d399",
  sales_order_schedule_line: "#6ee7b7",
};
const NODE_GROUPS = {
  accounting: "Journal Entries",
  billing: "Invoices",
  billing_cancellation: "Invoices",
  billing_item: "Invoices",
  business_partner: "Customers",
  business_partner_address: "Customers",
  customer_company_assignment: "Customers",
  customer_sales_area_assignment: "Customers",
  delivery: "Deliveries",
  delivery_item: "Deliveries",
  payment: "Payments",
  plant: "Deliveries",
  product: "Products",
  product_description: "Products",
  product_plant: "Products",
  product_storage_location: "Products",
  sales_order: "Sales Orders",
  sales_order_item: "Sales Orders",
  sales_order_schedule_line: "Sales Orders",
};
const PRIORITY_FIELDS = {
  accounting: [
    "companyCode",
    "fiscalYear",
    "accountingDocument",
    "glAccount",
    "referenceDocument",
    "costCenter",
    "profitCenter",
    "transactionCurrency",
    "amountInTransactionCurrency",
    "companyCodeCurrency",
    "amountInCompanyCodeCurrency",
    "postingDate",
    "documentDate",
    "accountingDocumentType",
    "accountingDocumentItem",
    "customer",
    "clearingAccountingDocument",
  ],
  billing: [
    "billingDocument",
    "billingDocumentType",
    "accountingDocument",
    "soldToParty",
    "totalNetAmount",
    "transactionCurrency",
    "billingDocumentDate",
    "companyCode",
    "fiscalYear",
  ],
  billing_cancellation: [
    "billingDocument",
    "billingDocumentIsCancelled",
    "billingDocumentDate",
    "accountingDocument",
    "soldToParty",
    "totalNetAmount",
    "transactionCurrency",
  ],
  billing_item: [
    "billingDocument",
    "billingDocumentItem",
    "material",
    "billingQuantity",
    "billingQuantityUnit",
    "netAmount",
    "transactionCurrency",
    "referenceSdDocument",
    "referenceSdDocumentItem",
  ],
  business_partner: [
    "businessPartner",
    "customer",
    "businessPartnerName",
    "businessPartnerFullName",
    "businessPartnerCategory",
    "businessPartnerGrouping",
    "creationDate",
    "lastChangeDate",
  ],
  business_partner_address: [
    "businessPartner",
    "addressId",
    "streetName",
    "cityName",
    "region",
    "postalCode",
    "country",
    "validityStartDate",
    "validityEndDate",
  ],
  customer_company_assignment: [
    "customer",
    "companyCode",
    "customerAccountGroup",
    "reconciliationAccount",
    "paymentTerms",
    "paymentMethodsList",
    "paymentBlockingReason",
  ],
  customer_sales_area_assignment: [
    "customer",
    "salesOrganization",
    "distributionChannel",
    "division",
    "currency",
    "customerPaymentTerms",
    "incotermsClassification",
    "incotermsLocation1",
    "supplyingPlant",
  ],
  delivery: [
    "deliveryDocument",
    "shippingPoint",
    "creationDate",
    "overallGoodsMovementStatus",
    "overallPickingStatus",
    "actualGoodsMovementDate",
  ],
  delivery_item: [
    "deliveryDocument",
    "deliveryDocumentItem",
    "referenceSdDocument",
    "referenceSdDocumentItem",
    "plant",
    "storageLocation",
    "actualDeliveryQuantity",
    "deliveryQuantityUnit",
  ],
  payment: [
    "clearingAccountingDocument",
    "accountingDocument",
    "customer",
    "amountInTransactionCurrency",
    "transactionCurrency",
    "postingDate",
    "documentDate",
    "glAccount",
  ],
  plant: [
    "plant",
    "plantName",
    "salesOrganization",
    "distributionChannel",
    "division",
    "valuationArea",
    "addressId",
  ],
  product: [
    "product",
    "productOldId",
    "productType",
    "productGroup",
    "baseUnit",
    "division",
    "creationDate",
    "lastChangeDate",
  ],
  product_description: [
    "product",
    "language",
    "productDescription",
  ],
  product_plant: [
    "product",
    "plant",
    "profitCenter",
    "mrpType",
    "availabilityCheckType",
    "countryOfOrigin",
    "regionOfOrigin",
  ],
  product_storage_location: [
    "product",
    "plant",
    "storageLocation",
    "physicalInventoryBlockInd",
    "dateOfLastPostedCntUnRstrcdStk",
  ],
  sales_order: [
    "salesOrder",
    "salesOrderType",
    "soldToParty",
    "totalNetAmount",
    "transactionCurrency",
    "creationDate",
    "requestedDeliveryDate",
    "salesOrganization",
    "distributionChannel",
  ],
  sales_order_item: [
    "salesOrder",
    "salesOrderItem",
    "material",
    "requestedQuantity",
    "requestedQuantityUnit",
    "netAmount",
    "transactionCurrency",
    "productionPlant",
    "storageLocation",
  ],
  sales_order_schedule_line: [
    "salesOrder",
    "salesOrderItem",
    "scheduleLine",
    "confirmedDeliveryDate",
    "orderQuantityUnit",
    "confdOrderQtyByMatlAvailCheck",
  ],
};

function normalizeLink(link) {
  const source = typeof link.source === "object" ? link.source.id : link.source;
  const target = typeof link.target === "object" ? link.target.id : link.target;

  return {
    source,
    target,
  };
}

function linkKey(link) {
  return `${link.source}->${link.target}`;
}

function mergeGraphData(currentGraph, incomingGraph) {
  const nodeMap = new Map(currentGraph.nodes.map((node) => [node.id, node]));
  const linkMap = new Map(
    currentGraph.links.map((link) => [linkKey(normalizeLink(link)), normalizeLink(link)])
  );

  for (const node of incomingGraph.nodes || []) {
    nodeMap.set(node.id, {
      ...nodeMap.get(node.id),
      ...node,
      details: {
        ...(nodeMap.get(node.id)?.details || {}),
        ...(node.details || {}),
      },
    });
  }

  for (const link of incomingGraph.links || []) {
    const normalizedLink = normalizeLink(link);
    linkMap.set(linkKey(normalizedLink), normalizedLink);
  }

  return {
    links: [...linkMap.values()],
    nodes: [...nodeMap.values()],
  };
}

function nodeColor(type) {
  return NODE_COLORS[type] || "#8c97a6";
}

function formatFieldLabel(field) {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\bgl\b/gi, "GL")
    .replace(/\bid\b/gi, "ID")
    .trim();
}

function formatFieldValue(value) {
  if (typeof value !== "string") {
    return String(value);
  }

  if (value.startsWith("{") && value.endsWith("}")) {
    try {
      const parsed = JSON.parse(value);

      if (
        typeof parsed.hours === "number" &&
        typeof parsed.minutes === "number" &&
        typeof parsed.seconds === "number"
      ) {
        return [parsed.hours, parsed.minutes, parsed.seconds]
          .map((part) => String(part).padStart(2, "0"))
          .join(":");
      }
    } catch (error) {
      return value;
    }
  }

  return value;
}

function buildDetailEntries(node) {
  if (!node?.details) {
    return {
      hiddenCount: 0,
      visibleEntries: [],
    };
  }

  const details = node.details;
  const priorityFields = PRIORITY_FIELDS[node.type] || [];
  const prioritySet = new Set(priorityFields);
  const orderedEntries = [];

  for (const field of priorityFields) {
    if (field in details) {
      orderedEntries.push([field, details[field]]);
    }
  }

  for (const entry of Object.entries(details)) {
    if (!prioritySet.has(entry[0])) {
      orderedEntries.push(entry);
    }
  }

  return {
    hiddenCount: Math.max(orderedEntries.length - MAX_VISIBLE_DETAIL_ENTRIES, 0),
    visibleEntries: orderedEntries.slice(0, MAX_VISIBLE_DETAIL_ENTRIES),
  };
}

function summarizeGraphData(graphData) {
  const counts = {};

  for (const node of graphData.nodes) {
    counts[node.type] = (counts[node.type] || 0) + 1;
  }

  return counts;
}

function countConnections(graphData, nodeId) {
  return graphData.links.reduce((total, link) => {
    const normalizedLink = normalizeLink(link);
    return normalizedLink.source === nodeId || normalizedLink.target === nodeId ? total + 1 : total;
  }, 0);
}

function isAttachedToSelectedNode(link, selectedNodeId) {
  if (!selectedNodeId) {
    return false;
  }

  const normalizedLink = normalizeLink(link);
  return normalizedLink.source === selectedNodeId || normalizedLink.target === selectedNodeId;
}

function drawLabel(context, node, label, radius, globalScale, centered = false) {
  const fontSize = (centered ? 11 : 10) / globalScale;
  context.font = `500 ${fontSize}px Inter, "Segoe UI", sans-serif`;
  context.fillStyle = "#111827";
  context.textAlign = centered ? "center" : "left";
  context.textBaseline = "middle";
  context.fillText(
    label,
    centered ? node.x : node.x + radius + 6 / globalScale,
    centered ? node.y + radius + 10 / globalScale : node.y
  );
}

export default function Graph({
  hiddenTypes = new Set(),
  initialEntity = "billing",
  initialId = "90504204",
  onSelectionChange = () => {},
}) {
  const graphContainerRef = useRef(null);
  const graphInstanceRef = useRef(null);
  const expandedNodeIdsRef = useRef(new Set());
  const hoveredNodeIdRef = useRef("");
  const selectedNodeIdRef = useRef("");
  const suppressBackgroundClickUntilRef = useRef(0);
  const shouldFitGraphRef = useRef(false);
  const hubNodesRef = useRef(new Map());
  const [graphData, setGraphData] = useState(DEFAULT_GRAPH);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState("");

  const selectedNode =
    graphData.nodes.find((node) => node.id === selectedNodeId) || null;
  const visibleGraphData = useMemo(() => {
    if (!hiddenTypes.size) {
      return graphData;
    }

    const visibleNodes = graphData.nodes.filter((node) => !hiddenTypes.has(node.type));
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

    return {
      nodes: visibleNodes,
      links: graphData.links.filter((link) => {
        const normalizedLink = normalizeLink(link);
        return visibleNodeIds.has(normalizedLink.source) && visibleNodeIds.has(normalizedLink.target);
      }),
    };
  }, [graphData, hiddenTypes]);
  const detailEntries = buildDetailEntries(selectedNode);
  const graphSummary = summarizeGraphData(graphData);
  const graphSummaryEntries = Object.entries(graphSummary).sort(([leftType], [rightType]) => {
    const leftLevel = PROCESS_LEVELS[leftType] ?? Number.MAX_SAFE_INTEGER;
    const rightLevel = PROCESS_LEVELS[rightType] ?? Number.MAX_SAFE_INTEGER;

    if (leftLevel !== rightLevel) {
      return leftLevel - rightLevel;
    }

    return (ENTITY_TITLES[leftType] || leftType).localeCompare(
      ENTITY_TITLES[rightType] || rightType
    );
  });
  const selectedNodeConnections = selectedNode
    ? countConnections(graphData, selectedNode.id)
    : 0;

  const syncGraphSize = useCallback(() => {
    const container = graphContainerRef.current;
    const graph = graphInstanceRef.current;

    if (!container || !graph) {
      return;
    }

    const { clientHeight, clientWidth } = container;

    if (!clientWidth || !clientHeight) {
      return;
    }

    graph.width(clientWidth).height(clientHeight);
  }, []);

  const loadGraph = useCallback(async (entity, entityId, options = {}) => {
    const expansionKey = `${entity}:${entityId}`;
    const { fitToCanvas = false } = options;

    if (!entity || !entityId || expandedNodeIdsRef.current.has(expansionKey)) {
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const response = await axios.get(`${API_BASE_URL}/graph`, {
        params: {
          entity,
          id: entityId,
        },
      });

      expandedNodeIdsRef.current.add(expansionKey);
      shouldFitGraphRef.current = fitToCanvas;

      setGraphData((currentGraph) => mergeGraphData(currentGraph, response.data));
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.error?.message || "Unable to load graph data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleNodeClick = useCallback((node, event) => {
    suppressBackgroundClickUntilRef.current = Date.now() + 450;
    event?.stopPropagation?.();
    selectedNodeIdRef.current = node.id;
    setSelectedNodeId(node.id);
    loadGraph(node.type, node.entityId, { fitToCanvas: false });

    if (
      graphInstanceRef.current &&
      Number.isFinite(node.x) &&
      Number.isFinite(node.y)
    ) {
      graphInstanceRef.current.centerAt(node.x, node.y, 500);
      graphInstanceRef.current.zoom(2.4, 500);
    }
  }, [loadGraph]);

  const handleMinimize = useCallback(() => {
    selectedNodeIdRef.current = "";
    setSelectedNodeId("");

    if (graphInstanceRef.current) {
      graphInstanceRef.current.zoomToFit(700, 90);
    }
  }, []);

  const handleZoom = useCallback((factor) => {
    const graph = graphInstanceRef.current;

    if (!graph) {
      return;
    }

    graph.zoom(graph.zoom() * factor, 240);
  }, []);

  const drawNode = (node, context, globalScale) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      return;
    }

    const isHovered = hoveredNodeIdRef.current === node.id;
    const isSelected = selectedNodeIdRef.current === node.id;
    const hubLabel = hubNodesRef.current.get(node.id);
    const isHub = Boolean(hubLabel);
    const radius = isSelected ? 8.2 : isHub ? 7.2 : isHovered ? 4.8 : 3.3;

    context.beginPath();
    context.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    context.fillStyle = nodeColor(node.type);
    context.fill();
    context.lineWidth = isSelected ? 2 : 0.8;
    context.strokeStyle = isSelected ? "#1d4ed8" : "#ffffff";
    context.stroke();

    if (isSelected) {
      context.beginPath();
      context.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI, false);
      context.strokeStyle = "rgba(37, 99, 235, 0.25)";
      context.lineWidth = 1;
      context.stroke();
    }

    if (isHub) {
      drawLabel(context, node, hubLabel, radius, globalScale, true);
    } else if (isSelected || isHovered) {
      drawLabel(
        context,
        node,
        `${ENTITY_TITLES[node.type] || node.type} ${node.entityId}`,
        radius,
        globalScale
      );
    }
  };

  useEffect(() => {
    const container = graphContainerRef.current;

    if (!container) {
      return undefined;
    }

    const graph = new ForceGraph(container)
      .autoPauseRedraw(false)
      .backgroundColor("transparent")
      .d3AlphaDecay(0.035)
      .cooldownTicks(180)
      .d3VelocityDecay(0.28)
      .enableNodeDrag(false)
      .linkCurvature(0.03)
      .linkColor((link) =>
        isAttachedToSelectedNode(link, selectedNodeIdRef.current)
          ? "rgba(37, 99, 235, 0.42)"
          : "rgba(148, 163, 184, 0.28)"
      )
      .linkWidth((link) =>
        isAttachedToSelectedNode(link, selectedNodeIdRef.current) ? 1.2 : 0.55
      )
      .nodeCanvasObject(drawNode)
      .nodeLabel((node) => `${ENTITY_TITLES[node.type] || node.type} ${node.entityId}`)
      .onBackgroundClick(() => {
        if (Date.now() < suppressBackgroundClickUntilRef.current) {
          return;
        }

        selectedNodeIdRef.current = "";
        setSelectedNodeId("");
      })
      .onNodeClick((node, event) => handleNodeClick(node, event))
      .onNodeHover((node) => {
        document.body.style.cursor = node ? "pointer" : "default";
        hoveredNodeIdRef.current = node?.id || "";
      })
      .warmupTicks(120);

    const chargeForce = graph.d3Force("charge");
    const linkForce = graph.d3Force("link");

    if (chargeForce) {
      chargeForce.strength(-135).distanceMax(680);
    }

    if (linkForce) {
      linkForce.distance(54).strength(0.82);
    }

    graphInstanceRef.current = graph;
    syncGraphSize();

    let resizeObserver = null;

    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        syncGraphSize();
      });
      resizeObserver.observe(container);
    } else {
      window.addEventListener("resize", syncGraphSize);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", syncGraphSize);
      }

      document.body.style.cursor = "default";
      graph._destructor();
      graphInstanceRef.current = null;
    };
  }, [handleNodeClick, syncGraphSize]);

  useEffect(() => {
    const degreeByNode = new Map();

    for (const link of visibleGraphData.links) {
      const normalized = normalizeLink(link);
      degreeByNode.set(normalized.source, (degreeByNode.get(normalized.source) || 0) + 1);
      degreeByNode.set(normalized.target, (degreeByNode.get(normalized.target) || 0) + 1);
    }

    const bestByGroup = new Map();
    for (const node of visibleGraphData.nodes) {
      const group = NODE_GROUPS[node.type];
      if (!group) continue;
      const degree = degreeByNode.get(node.id) || 0;
      if (!bestByGroup.has(group) || degree > bestByGroup.get(group).degree) {
        bestByGroup.set(group, { degree, id: node.id });
      }
    }

    hubNodesRef.current = new Map(
      [...bestByGroup.entries()].map(([group, value]) => [value.id, group])
    );
  }, [visibleGraphData]);

  useEffect(() => {
    const graph = graphInstanceRef.current;

    if (!graph) {
      return undefined;
    }

    graph
      .graphData(visibleGraphData)
      .linkColor((link) =>
        isAttachedToSelectedNode(link, selectedNodeIdRef.current)
          ? "rgba(37, 99, 235, 0.42)"
          : "rgba(148, 163, 184, 0.28)"
      )
      .linkWidth((link) =>
        isAttachedToSelectedNode(link, selectedNodeIdRef.current) ? 1.2 : 0.55
      )
      .nodeCanvasObject(drawNode);

    syncGraphSize();

    if (!shouldFitGraphRef.current || !visibleGraphData.nodes.length) {
      return undefined;
    }

    shouldFitGraphRef.current = false;
    const frameId = window.requestAnimationFrame(() => {
      graph.zoomToFit(700, 90);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [visibleGraphData, syncGraphSize]);

  useEffect(() => {
    onSelectionChange(selectedNode);
  }, [onSelectionChange, selectedNode]);

  useEffect(() => {
    if (selectedNode && hiddenTypes.has(selectedNode.type)) {
      selectedNodeIdRef.current = "";
      setSelectedNodeId("");
    }
  }, [hiddenTypes, selectedNode]);

  useEffect(() => {
    expandedNodeIdsRef.current = new Set();
    hoveredNodeIdRef.current = "";
    selectedNodeIdRef.current = "";
    shouldFitGraphRef.current = true;
    setGraphData(DEFAULT_GRAPH);
    setSelectedNodeId("");
    loadGraph(initialEntity, initialId, { fitToCanvas: true });
  }, [initialEntity, initialId, loadGraph]);

  return (
    <section className="map-stage">
      <div className="map-toolbar">
        <div className="map-toolbar__left">
          <button className="control-button control-button--wide" type="button">
            <span>⌁</span> Layout: Force directed <span>⌄</span>
          </button>
          <button className="control-button" type="button">▽ Filters</button>
          <button
            className="control-button"
            onClick={() => setSummaryVisible((currentValue) => !currentValue)}
            type="button"
          >
            ⠿ Legend
          </button>
        </div>
        <div className="map-toolbar__right">
          <button className="control-button" onClick={handleMinimize} type="button">Fit view&nbsp; ⌁</button>
          <button
            className="control-button control-button--icon"
            onClick={() => handleZoom(0.8)}
            type="button"
          >
            −
          </button>
          <button className="control-button zoom-value" type="button">100%⌄</button>
          <button
            className="control-button control-button--icon"
            onClick={() => handleZoom(1.25)}
            type="button"
          >
            +
          </button>
          <button className="control-button control-button--icon" type="button">↗</button>
          <button className="control-button control-button--icon" type="button">⇩</button>
        </div>
      </div>

      {loading ? (
        <div className="map-status">
          <span className="map-status__spinner" aria-hidden="true" />
          Expanding graph
        </div>
      ) : null}
      {errorMessage ? <div className="map-error">{errorMessage}</div> : null}

      <div className="map-surface">
        <div className="map-canvas" ref={graphContainerRef} />
        <div className="map-minimap" aria-hidden="true">
          {Array.from({ length: 74 }, (_, index) => (
            <i
              key={index}
              style={{
                background: ["#3478f6", "#20b486", "#9b5de5", "#ff8a1f", "#f04444", "#22b8c7"][index % 6],
                left: `${9 + ((index * 37) % 82)}%`,
                top: `${10 + ((index * 53) % 77)}%`,
              }}
            />
          ))}
        </div>

        {summaryVisible ? (
          <div className="map-summary">
            <div className="map-summary__totals">
              <span>{graphData.nodes.length} nodes</span>
              <span>{graphData.links.length} links</span>
            </div>
            <div className="map-summary__legend">
              {graphSummaryEntries.map(([type, count]) => (
                <div className="map-summary__item" key={type}>
                  <span
                    className="map-summary__dot"
                    style={{ "--legend-color": nodeColor(type) }}
                  />
                  <span>{ENTITY_TITLES[type] || formatFieldLabel(type)}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : null}

      </div>
    </section>
  );
}
