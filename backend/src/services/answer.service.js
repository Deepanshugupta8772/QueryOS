function humanize(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  return String(value);
}

function formatQueryAnswer({ rows, columns }) {
  if (!rows.length) {
    return "No matching records were found in the SAP Order-to-Cash dataset.";
  }

  if (rows.length === 1 && columns.length === 1) {
    const [columnName] = columns;
    return `${humanize(columnName)}: ${displayValue(rows[0][columnName])}`;
  }

  if (rows.length === 1) {
    return "Found 1 matching record in the SAP Order-to-Cash dataset.";
  }

  return `Found ${rows.length} matching records in the SAP Order-to-Cash dataset.`;
}

module.exports = {
  formatQueryAnswer,
};
