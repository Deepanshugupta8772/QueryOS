import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const DEFAULT_QUERY =
  "Show the top 5 billing documents by total net amount with the sold-to customer.";
const MAX_PREVIEW_COLUMNS = 5;
const MAX_PREVIEW_ROWS = 6;
const SUGGESTED_QUERIES = [
  "Top 5 billing documents by net amount",
  "Show unpaid customer invoices",
  "List recent sales orders with delivery status",
];
const INITIAL_MESSAGES = [
  {
    id: "assistant-welcome",
    meta: null,
    role: "assistant",
    text: "Hi! I can help you analyze the Order to Cash process.",
  },
];

function createMessage(role, text, meta = null) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    meta,
    role,
    text,
  };
}

function formatFieldLabel(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\bgl\b/gi, "GL")
    .replace(/\bid\b/gi, "ID")
    .trim();
}

function formatCellValue(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? new Intl.NumberFormat("en-US").format(value)
      : new Intl.NumberFormat("en-US", {
          maximumFractionDigits: 2,
          minimumFractionDigits: 0,
        }).format(value);
  }

  return String(value);
}

function ResultTable({ columns, rows }) {
  const visibleColumns = columns.slice(0, MAX_PREVIEW_COLUMNS);
  const visibleRows = rows.slice(0, MAX_PREVIEW_ROWS);

  if (!visibleColumns.length || !visibleRows.length) {
    return null;
  }

  return (
    <div className="result-table" role="list" aria-label="Query result rows">
      {visibleRows.map((row, rowIndex) => (
        <section className="result-table__row" key={`row-${rowIndex}`} role="listitem">
          <div className="result-table__row-header">Row {rowIndex + 1}</div>
          <dl className="result-table__fields">
            {visibleColumns.map((columnName) => (
              <div className="result-table__field" key={`${rowIndex}-${columnName}`}>
                <dt>{formatFieldLabel(columnName)}</dt>
                <dd>{formatCellValue(row[columnName])}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function AssistantMessage({ message }) {
  const hasRows = Array.isArray(message.meta?.rows) && message.meta.rows.length > 0;
  const hasSql = typeof message.meta?.sql === "string" && message.meta.sql.trim();

  return (
    <>
      <div className="chat-agent">
        <span className="chat-agent__avatar">S</span>
        <div className="chat-agent__meta">
          <strong>QueryOS AI</strong>
          <span>Graph Agent</span>
        </div>
      </div>

      <div className="chat-bubble chat-bubble--assistant">
        <p className="chat-bubble__summary">{message.text}</p>

        {hasRows ? (
          <>
            <div className="chat-result__stats">
              <span className="chat-result__pill">{message.meta.rowCount} rows</span>
              <span className="chat-result__pill">{message.meta.columns.length} columns</span>
              {message.meta.rows.length > MAX_PREVIEW_ROWS ? (
                <span className="chat-result__pill">showing {MAX_PREVIEW_ROWS}</span>
              ) : null}
            </div>

            <ResultTable columns={message.meta.columns} rows={message.meta.rows} />
          </>
        ) : null}

        {hasSql ? (
          <details className="chat-sql">
            <summary>Generated SQL</summary>
            <pre>{message.meta.sql}</pre>
          </details>
        ) : null}
      </div>
    </>
  );
}

export default function Chat() {
  const threadRef = useRef(null);
  const [draft, setDraft] = useState(DEFAULT_QUERY);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);

  const submitQuery = useCallback(
    async (event) => {
      event.preventDefault();

      const nextQuestion = draft.trim();

      if (!nextQuestion) {
        return;
      }

      setLoading(true);
      setDraft("");
      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage("user", nextQuestion),
      ]);

      try {
        const { data } = await axios.post(`${API_BASE_URL}/query`, {
          query: nextQuestion,
        });

        setMessages((currentMessages) => [
          ...currentMessages,
          createMessage("assistant", data.answer, {
            columns: Array.isArray(data.columns) ? data.columns : [],
            rowCount: Number.isInteger(data.rowCount) ? data.rowCount : 0,
            rows: Array.isArray(data.rows) ? data.rows : [],
            sql: data.sql || "",
          }),
        ]);
      } catch (error) {
        const message =
          error?.response?.data?.error?.message || "Unable to run the dataset query.";

        setMessages((currentMessages) => [
          ...currentMessages,
          createMessage("assistant", message),
        ]);
      } finally {
        setLoading(false);
      }
    },
    [draft]
  );

  const handleComposerKeyDown = useCallback(
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
    },
    []
  );

  useEffect(() => {
    if (!threadRef.current) {
      return;
    }

    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, loading]);

  return (
    <section className="chat-panel">
      <header className="chat-panel__header">
        <div className="chat-panel__title">
          <span className="chat-panel__spark" aria-hidden="true">✦</span>
          <div>
            <span className="chat-panel__eyebrow">QueryOS analyst</span>
            <h2>Ask your data</h2>
          </div>
        </div>
        <span className="chat-panel__badge">O2C</span>
      </header>

      <div className="chat-thread" ref={threadRef}>
        {messages.length === 1 ? (
          <div className="query-suggestions">
            <span>Try a question</span>
            {SUGGESTED_QUERIES.map((query) => (
              <button
                key={query}
                onClick={() => setDraft(query)}
                type="button"
              >
                {query}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((message) => (
          <article
            className={`chat-message chat-message--${message.role}`}
            key={message.id}
          >
            {message.role === "assistant" ? (
              <AssistantMessage message={message} />
            ) : (
              <>
                <div className="chat-message__label">You</div>
                <div className="chat-bubble chat-bubble--user">
                  <p>{message.text}</p>
                </div>
              </>
            )}
          </article>
        ))}

        {loading ? (
          <article className="chat-message chat-message--assistant">
            <div className="chat-agent">
              <span className="chat-agent__avatar">S</span>
              <div className="chat-agent__meta">
                <strong>QueryOS AI</strong>
                <span>Graph Agent</span>
              </div>
            </div>
            <div className="chat-bubble chat-bubble--assistant">
              <p className="chat-bubble__summary">Analyzing the SAP Order-to-Cash dataset.</p>
            </div>
          </article>
        ) : null}
      </div>

      <footer className="chat-composer">
        <div className="chat-composer__status">
          <span className="chat-composer__dot" />
          <span>{loading ? "Analyzing your request" : "Ready for a dataset question"}</span>
        </div>

        <form className="chat-form" onSubmit={submitQuery}>
          <textarea
            className="chat-input"
            onKeyDown={handleComposerKeyDown}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about orders, deliveries, billing, or payments..."
            rows={4}
            value={draft}
          />
          <div className="chat-form__actions">
            <span>Ctrl + Enter to send</span>
            <button className="chat-send" disabled={loading || !draft.trim()} type="submit">
              <span>Run query</span>
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
      </footer>
    </section>
  );
}
