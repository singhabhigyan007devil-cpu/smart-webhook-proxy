import sys
import os

filepath = r'c:\Users\ROG (N3200WS)\smart webhook proxy\frontend\app\page.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False

# Function to inject handleRetryLog
handle_retry_str = """  const handleRetryLog = async (endpoint_id: string, log_id: string) => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${API_BASE}/api/endpoints/${endpoint_id}/logs/${log_id}/retry`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (res.ok) {
        fetchData(apiKey);
      } else {
        const data = await res.json();
        alert(`Failed to retry: ${data.detail || "Unknown error"}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error triggering retry.");
    }
  };

"""

# Let's find the indices of the old table
start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if '/* Dense Monospace Table */' in line:
        start_idx = i
        break

for i in range(start_idx, len(lines)):
    if '</div>' in lines[i] and lines[i+1].strip() == ')}' and lines[i+2].strip() == '</div>':
        end_idx = i
        break

print(f"Start index: {start_idx}, End index: {end_idx}")

split_pane = """              <div className="flex h-[calc(100vh-250px)] border border-hairline rounded-lg overflow-hidden bg-surface-1">
                {/* Left Sidebar: Delivery List */}
                <div className="w-1/3 min-w-[300px] border-r border-hairline flex flex-col bg-surface-1">
                  <div className="p-3 border-b border-hairline bg-surface-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">Deliveries</h3>
                    <span className="text-[10px] text-ink-tertiary">{logs.length} events</span>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-hairline">
                    {logs.length === 0 ? (
                      <div className="p-8 text-center text-ink-tertiary text-xs">
                        No webhook payloads ingested yet.
                      </div>
                    ) : (
                      logs.map((log) => {
                        const date = new Date(log.created_at);
                        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        const ep = endpoints.find(e => e.id === log.endpoint_id);
                        const slugLabel = ep ? ep.slug : "deleted";

                        let statusBadge = "";
                        let icon = "";
                        if (log.delivery_status === "success") {
                          statusBadge = "text-success bg-emerald-500/10";
                          icon = "●";
                        } else if (log.delivery_status === "failed") {
                          statusBadge = "text-amber-400 bg-amber-500/10";
                          icon = "▲";
                        } else if (log.delivery_status === "dropped") {
                          statusBadge = "text-red-400 bg-red-500/10";
                          icon = "⨯";
                        } else {
                          statusBadge = "text-blue-400 bg-blue-500/10";
                          icon = "⟳";
                        }

                        return (
                          <div
                            key={log.id}
                            onClick={() => setSelectedLog(log)}
                            className={`p-3 hover:bg-surface-2/50 cursor-pointer transition-colors duration-100 flex flex-col space-y-1 ${
                              selectedLog?.id === log.id ? "bg-surface-2" : ""
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex items-center space-x-2">
                                <span className={`text-[10px] w-4 h-4 flex items-center justify-center rounded-full ${statusBadge}`}>
                                  {icon}
                                </span>
                                <span className="text-[11px] font-mono text-ink-muted truncate max-w-[150px]">/p/{slugLabel}</span>
                              </div>
                              <span className="text-[10px] text-ink-tertiary">{timeStr}</span>
                            </div>
                            <div className="flex justify-between items-center pl-6">
                              <span className="text-[10px] text-ink-tertiary uppercase">
                                {log.response_code ? `HTTP ${log.response_code}` : "Pending"}
                              </span>
                              {log.retry_count > 0 && (
                                <span className="text-[9px] bg-surface-3 px-1.5 py-0.5 rounded text-ink-tertiary">
                                  Retry {log.retry_count}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right Pane: Inspector */}
                <div className="flex-1 flex flex-col bg-surface-1 overflow-hidden">
                  {!selectedLog ? (
                    <div className="flex-1 flex items-center justify-center text-ink-tertiary flex-col space-y-4">
                      <Terminal className="w-8 h-8 opacity-20" />
                      <span className="text-xs">Select a delivery from the sidebar to inspect its payload.</span>
                    </div>
                  ) : (
                    <>
                      {/* Pane Header */}
                      <div className="p-4 border-b border-hairline bg-surface-2 flex items-center justify-between shrink-0">
                        <div className="flex items-center space-x-3">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${
                            selectedLog.delivery_status === "success"
                              ? "bg-emerald-500/10 text-success border-emerald-500/20"
                              : selectedLog.delivery_status === "failed"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-red-500/10 text-red-400 border-red-500/20"
                          }`}>
                            {selectedLog.delivery_status}
                          </span>
                          <span className="text-xs font-mono text-ink-subtle">{selectedLog.id}</span>
                        </div>
                        <button
                          onClick={() => handleRetryLog(selectedLog.endpoint_id, selectedLog.id)}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-primary hover:bg-primary-hover active:bg-primary-focus text-ink text-[11px] font-semibold border border-primary-focus/50 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry Delivery</span>
                        </button>
                      </div>

                      {/* Scrollable Payload/Headers */}
                      <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Error Alert */}
                        {selectedLog.error_message && (
                          <div className="p-4 bg-red-950/20 border border-red-900/40 rounded-lg space-y-1">
                            <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                              Error Details
                            </h4>
                            <p className="text-xs text-red-300 font-mono leading-relaxed break-words whitespace-pre-wrap">
                              {selectedLog.error_message}
                            </p>
                          </div>
                        )}
                        
                        {/* Headers */}
                        <div>
                          <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">Headers</h4>
                          <div className="bg-surface-2 border border-hairline rounded p-4 font-mono text-[11px] text-ink-subtle overflow-x-auto">
                            {Object.entries(selectedLog.headers_json).map(([k, v]) => (
                              <div key={k} className="flex mb-1">
                                <span className="text-ink min-w-[150px] font-medium">{k}:</span>
                                <span className="truncate max-w-[300px]" title={v as string}>{v as string}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Payload */}
                        <div>
                          <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">JSON Payload</h4>
                          <pre className="bg-surface-2 border border-hairline rounded p-4 font-mono text-[11px] text-ink-subtle overflow-x-auto whitespace-pre-wrap">
                            {(() => {
                              try {
                                return JSON.stringify(JSON.parse(selectedLog.payload_string), null, 2);
                              } catch {
                                return selectedLog.payload_string;
                              }
                            })()}
                          </pre>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>\n"""

inserted_handle = False
for i, line in enumerate(lines):
    if 'const handleToggleEndpointState =' in line and not inserted_handle:
        new_lines.append(handle_retry_str)
        inserted_handle = True

    if start_idx <= i <= end_idx:
        if i == start_idx:
            new_lines.append(split_pane)
        continue

    new_lines.append(line)

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Done refactoring page.tsx")
