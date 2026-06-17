"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Shield, 
  Activity, 
  Terminal, 
  Layers, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Power, 
  PowerOff, 
  Search, 
  X, 
  ChevronRight, 
  Copy, 
  Check, 
  LogOut,
  AlertTriangle,
  Keyboard
} from "lucide-react";

const API_BASE = "http://localhost:8000";

// --- Types ---
interface User {
  id: string;
  email: string;
  api_key: string;
  tier: string;
}

interface Endpoint {
  id: string;
  slug: string;
  source_name: string;
  secret_token: string;
  active_state: boolean;
  target_url: string;
  failure_count: number;
  created_at: string;
  alert_webhook_url?: string;
  auth_headers?: Record<string, string>;
  max_retries?: number;
  backoff_base?: number;
}

interface Incident {
  id: string;
  endpoint_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "urgent" | "high" | "medium" | "low";
  assignee: string | null;
  created_at: string;
  updated_at: string;
}

interface IncidentComment {
  id: string;
  incident_id: string;
  commenter: string;
  body: string;
  created_at: string;
}


interface WebhookLog {
  id: string;
  endpoint_id: string;
  payload_string: string;
  headers_json: Record<string, string>;
  response_code: number | null;
  delivery_status: "pending" | "success" | "failed" | "dropped";
  retry_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface Metrics {
  success_rate: number;
  active_endpoints: number;
  pending_retries: number;
  total_processed: number;
}

export default function Dashboard() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [authError, setAuthError] = useState("");
  
  // Dashboard state
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    success_rate: 100,
    active_endpoints: 0,
    pending_retries: 0,
    total_processed: 0
  });
  
  // Loading & Selection States
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null);
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);
  const [copiedSlugId, setCopiedSlugId] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  
  // Incidents & Comments State
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [incidentComments, setIncidentComments] = useState<IncidentComment[]>([]);
  const [newCommentBody, setNewCommentBody] = useState("");
  const [commenterName, setCommenterName] = useState("");
  const [assigneeInput, setAssigneeInput] = useState("");
  const [draggedOverCol, setDraggedOverCol] = useState<"todo" | "in_progress" | "done" | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  
  // Board Filters
  const [boardSearchQuery, setBoardSearchQuery] = useState("");
  const [boardPriorityFilter, setBoardPriorityFilter] = useState("all");
  const [boardAssigneeFilter, setBoardAssigneeFilter] = useState("all");
  
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<"logs" | "board">("logs");
  
  // Command Menu Overlay (Ctrl+K)
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");

  
  // Create Endpoint Form State
  const [sourceName, setSourceName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [alertWebhookUrl, setAlertWebhookUrl] = useState("");
  const [authHeadersInput, setAuthHeadersInput] = useState("");
  const [maxRetriesInput, setMaxRetriesInput] = useState("");
  const [backoffBaseInput, setBackoffBaseInput] = useState("");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Load Auth state
  useEffect(() => {
    const savedKey = localStorage.getItem("hookshield_api_key");
    if (savedKey) {
      setApiKey(savedKey);
      fetchProfile(savedKey);
    }
  }, []);

  const fetchProfile = async (key: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login?api_key=${key}`, {
        method: "POST"
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data);
      } else {
        // Clear if invalid
        handleLogout();
      }
    } catch (err) {
      console.error("Failed to load user session", err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setIsLoading(true);
    setAuthError("");
    try {
      // Login endpoint auto registers if input looks like an email or matches API key
      const response = await fetch(`${API_BASE}/api/auth/login?api_key=${encodeURIComponent(emailInput.trim())}`, {
        method: "POST"
      });
      
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem("hookshield_api_key", data.api_key);
        setApiKey(data.api_key);
        setUser(data);
      } else {
        const errData = await response.json();
        setAuthError(errData.detail || "Authentication failed. Enter email to register or paste your API key.");
      }
    } catch (err) {
      setAuthError("Unable to connect to backend service. Please check that FastAPI is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("hookshield_api_key");
    setApiKey(null);
    setUser(null);
    setEndpoints([]);
    setLogs([]);
    setIncidents([]);
    setSelectedEndpoint(null);
    setSelectedLog(null);
    setSelectedIncident(null);
  };

  // --- Data Fetching ---
  const fetchData = useCallback(async () => {
    if (!apiKey) return;
    try {
      // Headers setup
      const headers = { "Authorization": `Bearer ${apiKey}` };

      // 1. Fetch Endpoints
      const epRes = await fetch(`${API_BASE}/api/endpoints`, { headers });
      if (epRes.ok) {
        const data = await epRes.json();
        setEndpoints(data);
      }

      // 2. Fetch Metrics
      const metRes = await fetch(`${API_BASE}/api/metrics`, { headers });
      if (metRes.ok) {
        const data = await metRes.json();
        setMetrics(data);
      }

      // 3. Fetch Webhook Logs
      const logsRes = await fetch(`${API_BASE}/api/logs?limit=50`, { headers });
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data);
      }

      // 4. Fetch Webhook Incidents
      const incRes = await fetch(`${API_BASE}/api/incidents`, { headers });
      if (incRes.ok) {
        const data = await incRes.json();
        setIncidents(data);
      }
    } catch (err) {
      console.error("Error polling backend dashboard data", err);
    }
  }, [apiKey]);

  // Comments & Incident Mutator functions
  const fetchIncidentComments = useCallback(async (incidentId: string) => {
    if (!apiKey) return;
    try {
      const headers = { "Authorization": `Bearer ${apiKey}` };
      const response = await fetch(`${API_BASE}/api/incidents/${incidentId}/comments`, { headers });
      if (response.ok) {
        const data = await response.json();
        setIncidentComments(data);
      }
    } catch (err) {
      console.error("Failed to fetch incident comments", err);
    }
  }, [apiKey]);

  useEffect(() => {
    if (selectedIncident) {
      fetchIncidentComments(selectedIncident.id);
      setAssigneeInput(selectedIncident.assignee || "");
    } else {
      setIncidentComments([]);
    }
  }, [selectedIncident, fetchIncidentComments]);

  const handleUpdateIncident = async (id: string, updates: Partial<Incident>) => {
    if (!apiKey) return;
    try {
      const response = await fetch(`${API_BASE}/api/incidents/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(updates)
      });
      if (response.ok) {
        const updated = await response.json();
        setIncidents(prev => prev.map(inc => inc.id === id ? updated : inc));
        if (selectedIncident?.id === id) {
          setSelectedIncident(updated);
        }
        fetchData();
      }
    } catch (err) {
      console.error("Failed to update incident", err);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident || !newCommentBody.trim()) return;
    const name = commenterName.trim() || user?.email.split("@")[0] || "developer";
    try {
      const response = await fetch(`${API_BASE}/api/incidents/${selectedIncident.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          commenter: name,
          body: newCommentBody.trim()
        })
      });
      if (response.ok) {
        setNewCommentBody("");
        fetchIncidentComments(selectedIncident.id);
      }
    } catch (err) {
      console.error("Failed to post comment", err);
    }
  };

  // Keyboard Shortcuts Refs to avoid stale closures
  const showCommandMenuRef = React.useRef(showCommandMenu);
  const showShortcutsModalRef = React.useRef(showShortcutsModal);
  const selectedIncidentRef = React.useRef(selectedIncident);

  useEffect(() => {
    showCommandMenuRef.current = showCommandMenu;
  }, [showCommandMenu]);

  useEffect(() => {
    showShortcutsModalRef.current = showShortcutsModal;
  }, [showShortcutsModal]);

  useEffect(() => {
    selectedIncidentRef.current = selectedIncident;
  }, [selectedIncident]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputActive = activeTag === "input" || activeTag === "textarea";

      // 1. Ctrl+K -> Command Menu
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "k" || e.code === "KeyK")) {
        e.preventDefault();
        setShowCommandMenu(prev => !prev);
      }
      
      // 2. ? -> Shortcuts Modal
      if (!isInputActive && (e.key === "?" || (e.key === "/" && e.shiftKey) || (e.code === "Slash" && e.shiftKey))) {
        e.preventDefault();
        setShowShortcutsModal(prev => !prev);
      }

      // 3. c -> Focus comment input (only if details drawer is open)
      if (!isInputActive && (e.key.toLowerCase() === "c" || e.code === "KeyC") && selectedIncidentRef.current) {
        e.preventDefault();
        setTimeout(() => {
          const commentInput = document.getElementById("comment-body-input");
          if (commentInput) {
            commentInput.focus();
          }
        }, 0);
      }
      
      // 4. Escape -> Close all
      if (e.key === "Escape" || e.code === "Escape") {
        if (showCommandMenuRef.current || showShortcutsModalRef.current || selectedIncidentRef.current) {
          e.preventDefault();
          setShowCommandMenu(false);
          setShowShortcutsModal(false);
          setSelectedIncident(null);
        }
      }
      
      // 5. b/l -> Navigation (only if nothing is open)
      if (!isInputActive && !showCommandMenuRef.current && !showShortcutsModalRef.current) {
        if (e.key.toLowerCase() === "b" || e.code === "KeyB") {
          setActiveTab("board");
        }
        if (e.key.toLowerCase() === "l" || e.code === "KeyL") {
          setActiveTab("logs");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);


  // Polling loop
  useEffect(() => {
    if (apiKey) {
      fetchData();
      const interval = setInterval(fetchData, 3000); // Poll every 3s
      return () => clearInterval(interval);
    }
  }, [apiKey, fetchData]);

  // --- Endpoint CRUD Handlers ---
  const handleCreateEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceName.trim() || !targetUrl.trim()) return;
    setIsCreating(true);
    setCreateError("");
    try {
      let headersObj = null;
      if (authHeadersInput.trim()) {
        try {
          headersObj = JSON.parse(authHeadersInput.trim());
          if (typeof headersObj !== "object" || headersObj === null) {
            throw new Error("Must be a JSON object");
          }
        } catch (e) {
          setCreateError("Custom Headers must be a valid JSON object (e.g. {\"Authorization\": \"Bearer token\"})");
          setIsCreating(false);
          return;
        }
      }

      const response = await fetch(`${API_BASE}/api/endpoints`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          source_name: sourceName,
          target_url: targetUrl,
          slug: customSlug.trim() || undefined,
          alert_webhook_url: alertWebhookUrl.trim() || undefined,
          auth_headers: headersObj || undefined,
          max_retries: maxRetriesInput ? parseInt(maxRetriesInput) : undefined,
          backoff_base: backoffBaseInput ? parseInt(backoffBaseInput) : undefined
        })
      });

      if (response.ok) {
        setSourceName("");
        setTargetUrl("");
        setCustomSlug("");
        setAlertWebhookUrl("");
        setAuthHeadersInput("");
        setMaxRetriesInput("");
        setBackoffBaseInput("");
        fetchData();
      } else {
        const err = await response.json();
        setCreateError(err.detail || "Failed to create endpoint.");
      }
    } catch (err) {
      setCreateError("Error communicating with database.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleEndpointState = async (endpoint: Endpoint) => {
    try {
      const response = await fetch(`${API_BASE}/api/endpoints/${endpoint.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          active_state: !endpoint.active_state
        })
      });
      if (response.ok) {
        fetchData();
        if (selectedEndpoint?.id === endpoint.id) {
          setSelectedEndpoint({ ...endpoint, active_state: !endpoint.active_state });
        }
      }
    } catch (err) {
      console.error("Failed to toggle state", err);
    }
  };

  const handleDeleteEndpoint = async (id: string) => {
    if (!confirm("Are you sure you want to delete this endpoint? All delivery logs will be lost.")) return;
    try {
      const response = await fetch(`${API_BASE}/api/endpoints/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });
      if (response.ok) {
        setSelectedEndpoint(null);
        fetchData();
      }
    } catch (err) {
      console.error("Failed to delete endpoint", err);
    }
  };

  // --- Copy Handlers ---
  const copyToClipboard = (text: string, id: string, type: "slug" | "key") => {
    navigator.clipboard.writeText(text);
    if (type === "slug") {
      setCopiedSlugId(id);
      setTimeout(() => setCopiedSlugId(null), 2000);
    } else {
      setCopiedKeyId(id);
      setTimeout(() => setCopiedKeyId(null), 2000);
    }
  };

  const renderBoardFilterBar = () => {
    const uniqueAssignees = Array.from(new Set(incidents.map(i => i.assignee).filter((a): a is string => !!a)));
    const hasFiltersActive = boardSearchQuery.trim() !== "" || boardPriorityFilter !== "all" || boardAssigneeFilter !== "all";

    return (
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 border-b border-hairline bg-surface-1/40">
        <div className="flex flex-1 flex-col md:flex-row md:items-center gap-3">
          {/* Text Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
            <input 
              type="text" 
              placeholder="Search incidents by title, slug..." 
              value={boardSearchQuery}
              onChange={(e) => setBoardSearchQuery(e.target.value)}
              className="w-full bg-surface-2 text-ink text-xs rounded border border-hairline pl-9 pr-2.5 py-1.5 focus:outline-none focus:border-primary-focus transition-all placeholder:text-ink-tertiary"
            />
          </div>

          {/* Priority Filter */}
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-ink-subtle font-medium uppercase tracking-wider">Priority:</span>
            <select 
              value={boardPriorityFilter}
              onChange={(e) => setBoardPriorityFilter(e.target.value)}
              className="bg-surface-2 text-ink text-xs rounded border border-hairline px-2 py-1.5 focus:outline-none focus:border-primary-focus cursor-pointer"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="no_priority">No Priority</option>
            </select>
          </div>

          {/* Assignee Filter */}
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-ink-subtle font-medium uppercase tracking-wider">Assignee:</span>
            <select 
              value={boardAssigneeFilter}
              onChange={(e) => setBoardAssigneeFilter(e.target.value)}
              className="bg-surface-2 text-ink text-xs rounded border border-hairline px-2 py-1.5 focus:outline-none focus:border-primary-focus cursor-pointer"
            >
              <option value="all">All Assignees</option>
              <option value="unassigned">Unassigned</option>
              {uniqueAssignees.map((assignee) => (
                <option key={assignee} value={assignee}>{assignee}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Clear Filters Button */}
        {hasFiltersActive && (
          <button 
            onClick={() => {
              setBoardSearchQuery("");
              setBoardPriorityFilter("all");
              setBoardAssigneeFilter("all");
            }}
            className="text-[10px] hover:text-primary border border-dashed border-hairline hover:border-primary/30 rounded px-2.5 py-1.5 font-medium text-ink-subtle hover:bg-primary/5 transition-all w-fit shrink-0"
          >
            Clear Filters
          </button>
        )}
      </div>
    );
  };

  const renderBoardColumn = (colStatus: "todo" | "in_progress" | "done", label: string, badgeStyles: string) => {
    const colIncidents = incidents.filter(i => i.status === colStatus);
    const isDraggedOver = draggedOverCol === colStatus;
    
    return (
      <div 
        onDragOver={(e) => {
          e.preventDefault();
          if (draggedOverCol !== colStatus) {
            setDraggedOverCol(colStatus);
          }
        }}
        onDragLeave={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX;
          const y = e.clientY;
          if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
            setDraggedOverCol(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDraggedOverCol(null);
          const incidentId = e.dataTransfer.getData("text/plain");
          if (incidentId) {
            handleUpdateIncident(incidentId, { status: colStatus });
          }
        }}
        className={`flex flex-col space-y-3 p-3 min-h-[400px] rounded border transition-all duration-200 ease-out ${
          isDraggedOver 
            ? "bg-primary/5 border-primary/40 ring-1 ring-primary/10 shadow-lg shadow-primary/5 scale-[1.01]" 
            : "bg-surface-1/40 border-hairline"
        }`}
      >
        <div className="flex items-center justify-between pb-2 border-b border-hairline">
          <span className={`text-[10px] uppercase font-semibold px-2.5 py-0.5 rounded-full border ${badgeStyles}`}>
            {label}
          </span>
          <span className="text-[10px] text-ink-tertiary font-mono">{colIncidents.length}</span>
        </div>
        
        <div className="flex-1 space-y-2 overflow-y-auto max-h-[450px] pr-1">
          {colIncidents.length === 0 ? (
            <div className="text-[10px] text-ink-tertiary italic text-center py-4">No incidents</div>
          ) : (
            colIncidents.map(inc => {
              const ep = endpoints.find(e => e.id === inc.endpoint_id);
              const slugLabel = ep ? ep.slug : "deleted";
              
              let priorityBadge = "border-hairline text-ink-subtle bg-surface-2";
              if (inc.priority === "urgent") priorityBadge = "border-red-500/30 text-red-400 bg-red-950/20";
              if (inc.priority === "high") priorityBadge = "border-orange-500/30 text-orange-400 bg-orange-950/20";
              if (inc.priority === "medium") priorityBadge = "border-amber-500/30 text-amber-400 bg-amber-950/20";
              
              return (
                <div 
                  key={inc.id}
                  onClick={() => setSelectedIncident(inc)}
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", inc.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.currentTarget.classList.add("opacity-40");
                  }}
                  onDragEnd={(e) => {
                    e.currentTarget.classList.remove("opacity-40");
                  }}
                  className={`bg-surface-2 border border-hairline hover:border-hairline-strong rounded p-3 cursor-grab active:cursor-grabbing transition-all duration-150 ${
                    selectedIncident?.id === inc.id ? "ring-1 ring-primary border-primary bg-primary/5" : ""
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded border ${priorityBadge}`}>
                      {inc.priority}
                    </span>
                    <span className="text-[9px] font-mono text-ink-tertiary">/p/{slugLabel}</span>
                  </div>
                  <h4 className="text-xs font-semibold text-ink mt-2 line-clamp-2">{inc.title}</h4>
                  {inc.assignee && (
                    <div className="mt-3 flex items-center space-x-1.5 text-[9px] text-primary font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span>{inc.assignee}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // --- Render Login Screen ---
  if (!apiKey || !user) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col justify-center items-center px-4 selection:bg-primary selection:text-white">
        <div className="w-full max-w-md bg-surface-1 border border-hairline rounded-lg p-8 shadow-2xl relative overflow-hidden">
          {/* Faint subtle grid highlight line at top */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-lg bg-surface-2 border border-hairline flex items-center justify-center mb-4 text-primary">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink font-sans">Sign in to HookShield</h1>
            <p className="text-sm text-ink-subtle mt-2 text-center">
              smart webhook proxy & exponential retry control deck.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
                Developer Credentials
              </label>
              <input 
                type="text" 
                placeholder="Enter email to sign up, or API Key to connect" 
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                disabled={isLoading}
                className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none focus:ring-2 focus:ring-primary-focus/50 px-3 py-2 transition-all duration-200"
              />
            </div>

            {authError && (
              <div className="p-3 bg-red-950/20 border border-red-900/50 rounded text-xs text-red-400 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary-hover active:bg-primary-focus text-ink rounded font-medium text-sm py-2 px-4 border border-primary-focus/50 transition-colors duration-150 flex items-center justify-center space-x-2 shadow-sm"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <span>Launch Deck</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-hairline text-center">
            <span className="text-[11px] text-ink-tertiary">
              Built on Next.js 15, FastAPI & SQLAlchemy 2.0. Clean architecture verified.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // --- Render Dashboard Screen ---
  return (
    <div className="min-h-screen bg-canvas flex flex-col font-sans selection:bg-primary selection:text-white">
      {/* 1. Header (Top Navigation) */}
      <header className="h-[56px] border-b border-hairline bg-canvas/80 backdrop-blur sticky top-0 z-40 flex items-center justify-between px-6">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded bg-surface-1 border border-hairline flex items-center justify-center text-primary">
            <Shield className="w-4 h-4" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-ink">HookShield</span>
          <span className="text-[10px] bg-surface-2 border border-hairline-strong text-ink-subtle px-1.5 py-0.5 rounded uppercase font-medium">
            Control Deck
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex flex-col items-end text-xs">
            <span className="text-ink font-medium">{user.email}</span>
            <span className="text-ink-subtle text-[10px] uppercase tracking-wider font-semibold text-primary">
              {user.tier} Tier
            </span>
          </div>
          
          <button 
            onClick={handleLogout}
            className="p-1.5 rounded bg-surface-1 border border-hairline hover:bg-surface-2 hover:border-hairline-strong text-ink-subtle hover:text-ink transition-colors duration-150"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Main Content Area */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-6 space-y-6">
        
        {/* Active Metrics Bar */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-surface-1 border border-hairline rounded-lg p-5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-ink-subtle uppercase tracking-wider">Success Rate</span>
              <h2 className="text-2xl font-semibold tracking-tight text-ink mt-1">
                {metrics.success_rate}%
              </h2>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/5 text-success border border-emerald-500/10">
              <Activity className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-surface-1 border border-hairline rounded-lg p-5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-ink-subtle uppercase tracking-wider">Active Endpoints</span>
              <h2 className="text-2xl font-semibold tracking-tight text-ink mt-1">
                {metrics.active_endpoints}
              </h2>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 text-primary border border-primary/10">
              <Layers className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-surface-1 border border-hairline rounded-lg p-5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-ink-subtle uppercase tracking-wider">Retries pending</span>
              <h2 className="text-2xl font-semibold tracking-tight text-ink mt-1">
                {metrics.pending_retries}
              </h2>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/5 text-amber-400 border border-amber-500/10">
              <RefreshCw className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-surface-1 border border-hairline rounded-lg p-5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-ink-subtle uppercase tracking-wider">Total Processed</span>
              <h2 className="text-2xl font-semibold tracking-tight text-ink mt-1">
                {metrics.total_processed}
              </h2>
            </div>
            <div className="p-3 rounded-lg bg-indigo-500/5 text-indigo-400 border border-indigo-500/10">
              <Terminal className="w-5 h-5" />
            </div>
          </div>
        </section>

        {/* Dashboard Panels */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT: Endpoints Controls (Column span 5) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Create Webhook Card */}
            <div className="bg-surface-1 border border-hairline rounded-lg p-6">
              <h3 className="text-sm font-semibold tracking-tight text-ink mb-4 flex items-center space-x-2">
                <Plus className="w-4 h-4 text-primary" />
                <span>Create Proxy Endpoint</span>
              </h3>
              
              <form onSubmit={handleCreateEndpoint} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                    Source Provider Name
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. Stripe Outbound, GitHub API Webhook" 
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                    Destination URL
                  </label>
                  <input 
                    type="url" 
                    placeholder="https://api.yourdomain.com/webhooks" 
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                    Custom Proxy Slug (Optional)
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l border border-r-0 border-hairline bg-surface-3 text-ink-tertiary text-xs">
                      /p/
                    </span>
                    <input 
                      type="text" 
                      placeholder="stripe-prod (auto-generated if empty)" 
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value)}
                      className="w-full bg-surface-2 text-ink text-sm rounded-r border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                    Alert Webhook URL (Slack/Discord)
                  </label>
                  <input 
                    type="url" 
                    placeholder="https://hooks.slack.com/services/..." 
                    value={alertWebhookUrl}
                    onChange={(e) => setAlertWebhookUrl(e.target.value)}
                    className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                    Custom Headers (JSON Format)
                  </label>
                  <textarea 
                    placeholder='{"Authorization": "Bearer token123", "X-My-Header": "value"}' 
                    value={authHeadersInput}
                    onChange={(e) => setAuthHeadersInput(e.target.value)}
                    rows={2}
                    className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150 font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                      Max Retries
                    </label>
                    <input 
                      type="number" 
                      placeholder="e.g. 5 (Default: 10)" 
                      value={maxRetriesInput}
                      onChange={(e) => setMaxRetriesInput(e.target.value)}
                      min="0"
                      max="50"
                      className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                      Backoff Base (sec)
                    </label>
                    <input 
                      type="number" 
                      placeholder="e.g. 2 (Default: 2)" 
                      value={backoffBaseInput}
                      onChange={(e) => setBackoffBaseInput(e.target.value)}
                      min="1"
                      max="60"
                      className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                    />
                  </div>
                </div>

                {createError && (
                  <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/50 p-2 rounded">
                    {createError}
                  </p>
                )}

                <button 
                  type="submit" 
                  disabled={isCreating}
                  className="w-full bg-primary hover:bg-primary-hover active:bg-primary-focus text-ink rounded font-medium text-xs py-2 px-4 border border-primary-focus/50 transition-colors duration-150"
                >
                  {isCreating ? "Deploying..." : "Deploy Proxy Link"}
                </button>
              </form>
            </div>

            {/* List Endpoints */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">
                Configured Endpoints
              </h3>

              {endpoints.length === 0 ? (
                <div className="bg-surface-1 border border-hairline rounded-lg p-6 text-center text-ink-tertiary text-sm">
                  No active proxy endpoints deployed.
                </div>
              ) : (
                endpoints.map((ep) => (
                  <div 
                    key={ep.id}
                    onClick={() => setSelectedEndpoint(ep)}
                    className={`bg-surface-1 border rounded-lg p-4 cursor-pointer transition-all duration-150 hover:bg-surface-2/40 ${
                      selectedEndpoint?.id === ep.id 
                        ? "border-primary-focus bg-surface-2/20" 
                        : "border-hairline"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-medium text-ink">{ep.source_name}</h4>
                        <div className="flex items-center space-x-1.5 mt-1">
                          <span className="text-[10px] text-ink-subtle font-mono bg-surface-3 px-1 py-0.5 rounded">
                            /p/{ep.slug}
                          </span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(`${API_BASE}/p/${ep.slug}`, ep.id, "slug");
                            }}
                            className="p-1 hover:bg-surface-3 rounded text-ink-tertiary hover:text-ink transition-colors"
                            title="Copy Ingest URL"
                          >
                            {copiedSlugId === ep.id ? (
                              <Check className="w-3 h-3 text-success" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Endpoint Active Toggle */}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleEndpointState(ep);
                        }}
                        className={`p-1.5 rounded-full border transition-colors duration-150 ${
                          ep.active_state 
                            ? "bg-emerald-500/10 border-emerald-500/20 text-success hover:bg-emerald-500/20"
                            : "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
                        }`}
                        title={ep.active_state ? "Pause Endpoint" : "Resume Endpoint"}
                      >
                        {ep.active_state ? (
                          <Power className="w-3.5 h-3.5" />
                        ) : (
                          <PowerOff className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <p className="text-xs text-ink-subtle mt-3 truncate">
                      <span className="text-ink-tertiary">To:</span> {ep.target_url}
                    </p>

                    {/* Circuit breaker count indicator */}
                    {ep.failure_count > 0 && (
                      <div className="mt-2.5 flex items-center space-x-1.5 text-[10px] text-amber-400 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{ep.failure_count} consecutive delivery failures</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

          </div>

          {/* RIGHT: Webhooks Log Stream Table (Column span 7) */}
          <div className="lg:col-span-7 bg-surface-1 border border-hairline rounded-lg overflow-hidden">
            <div className="p-4 border-b border-hairline flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => setActiveTab("logs")}
                  className={`text-sm font-semibold tracking-tight transition-colors duration-150 flex items-center space-x-2 pb-0.5 ${
                    activeTab === "logs" ? "text-ink border-b-2 border-primary" : "text-ink-subtle hover:text-ink"
                  }`}
                >
                  <Terminal className="w-4 h-4" />
                  <span>Live Event Logs</span>
                </button>
                <button 
                  onClick={() => setActiveTab("board")}
                  className={`text-sm font-semibold tracking-tight transition-colors duration-150 flex items-center space-x-2 pb-0.5 ${
                    activeTab === "board" ? "text-ink border-b-2 border-primary" : "text-ink-subtle hover:text-ink"
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Incident Board ({incidents.filter(i => i.status !== "done").length})</span>
                </button>
              </div>
              <div className="flex items-center space-x-3">
                {activeTab === "logs" && (
                  <div className="flex items-center space-x-2 mr-1">
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="text-[10px] uppercase font-semibold text-ink-subtle tracking-wider">
                      Listening
                    </span>
                  </div>
                )}
                <button 
                  onClick={() => setShowShortcutsModal(true)}
                  className="flex items-center space-x-1.5 px-2 py-1 rounded bg-surface-2 border border-hairline hover:bg-surface-3 text-[10px] text-ink-subtle hover:text-ink font-medium tracking-tight transition-colors duration-150"
                  title="Keyboard Shortcuts (?)"
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline font-mono uppercase bg-surface-3 px-1 rounded border border-hairline text-[8px] text-ink-tertiary">?</span>
                </button>
              </div>
            </div>

            {activeTab === "board" ? (
              <div className="flex flex-col bg-canvas min-h-[450px]">
                {renderBoardFilterBar()}
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {renderBoardColumn("todo", "Todo", "bg-amber-500/10 border-amber-500/20 text-amber-400")}
                  {renderBoardColumn("in_progress", "In Progress", "bg-blue-500/10 border-blue-500/20 text-blue-400")}
                  {renderBoardColumn("done", "Done", "bg-emerald-500/10 border-emerald-500/20 text-success")}
                </div>
              </div>
            ) : (
              /* Dense Monospace Table */
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-hairline text-ink-subtle text-[11px] font-semibold uppercase bg-surface-2/40">
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Slug</th>
                      <th className="py-2.5 px-4">Method</th>
                      <th className="py-2.5 px-4">Code</th>
                      <th className="py-2.5 px-4">Retry</th>
                      <th className="py-2.5 px-4 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline font-mono text-[11px]">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-ink-tertiary">
                          No webhook payloads ingested yet.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => {
                        const date = new Date(log.created_at);
                        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        const ep = endpoints.find(e => e.id === log.endpoint_id);
                        const slugLabel = ep ? ep.slug : "deleted";

                        // Status styles
                        let statusBadge = "";
                        if (log.delivery_status === "success") {
                          statusBadge = "bg-emerald-500/10 text-success border-emerald-500/20";
                        } else if (log.delivery_status === "failed") {
                          statusBadge = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                        } else if (log.delivery_status === "dropped") {
                          statusBadge = "bg-red-500/10 text-red-400 border-red-500/20";
                        } else {
                          statusBadge = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                        }

                        return (
                          <tr 
                            key={log.id}
                            onClick={() => setSelectedLog(log)}
                            className={`hover:bg-surface-2/30 cursor-pointer transition-colors duration-100 ${
                              selectedLog?.id === log.id ? "bg-surface-2/50" : ""
                            }`}
                          >
                            <td className="py-2 px-4">
                              <span className={`px-2 py-0.5 rounded-full border text-[9px] font-semibold uppercase ${statusBadge}`}>
                                {log.delivery_status}
                              </span>
                            </td>
                            <td className="py-2 px-4 text-ink-muted">{slugLabel}</td>
                            <td className="py-2 px-4 text-ink-tertiary">POST</td>
                            <td className="py-2 px-4">
                              {log.response_code ? (
                                <span className={log.response_code >= 200 && log.response_code < 300 ? "text-success" : "text-red-400"}>
                                  {log.response_code}
                                </span>
                              ) : (
                                <span className="text-ink-tertiary">—</span>
                              )}
                            </td>
                            <td className="py-2 px-4 text-ink-muted">x{log.retry_count}</td>
                            <td className="py-2 px-4 text-right text-ink-tertiary">{timeStr}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </section>

        {/* Selected Endpoint Info card below */}
        {selectedEndpoint && (
          <section className="bg-surface-1 border border-hairline rounded-lg p-6 max-w-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold tracking-tight text-ink flex items-center space-x-2">
                <Layers className="w-4 h-4 text-primary" />
                <span>Endpoint Configuration: {selectedEndpoint.source_name}</span>
              </h3>
              <button 
                onClick={() => handleToggleEndpointState(selectedEndpoint)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  selectedEndpoint.active_state
                    ? "bg-emerald-500/10 border-emerald-500/20 text-success hover:bg-emerald-500/20"
                    : "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
                }`}
              >
                {selectedEndpoint.active_state ? "Active" : "Paused"}
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs text-ink-muted">
              <div className="flex justify-between py-1 border-b border-hairline">
                <span className="text-ink-tertiary">Ingestion URL:</span>
                <div className="flex items-center space-x-2">
                  <span className="text-ink bg-surface-2 px-1 rounded">{`${API_BASE}/p/${selectedEndpoint.slug}`}</span>
                  <button 
                    onClick={() => copyToClipboard(`${API_BASE}/p/${selectedEndpoint.slug}`, selectedEndpoint.id, "slug")}
                    className="hover:text-ink"
                  >
                    {copiedSlugId === selectedEndpoint.id ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-between py-1 border-b border-hairline">
                <span className="text-ink-tertiary">Secret Signing Token:</span>
                <div className="flex items-center space-x-2">
                  <span className="text-ink bg-surface-2 px-1 rounded truncate max-w-[200px]">{selectedEndpoint.secret_token}</span>
                  <button 
                    onClick={() => copyToClipboard(selectedEndpoint.secret_token, selectedEndpoint.id, "key")}
                    className="hover:text-ink"
                  >
                    {copiedKeyId === selectedEndpoint.id ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-between py-1 border-b border-hairline">
                <span className="text-ink-tertiary">Outbound Target:</span>
                <span className="text-ink truncate max-w-[250px]">{selectedEndpoint.target_url}</span>
              </div>

              {selectedEndpoint.alert_webhook_url && (
                <div className="flex justify-between py-1 border-b border-hairline font-mono text-xs">
                  <span className="text-ink-tertiary">Alert Webhook:</span>
                  <span className="text-ink truncate max-w-[250px]" title={selectedEndpoint.alert_webhook_url}>
                    {selectedEndpoint.alert_webhook_url}
                  </span>
                </div>
              )}

              {selectedEndpoint.auth_headers && Object.keys(selectedEndpoint.auth_headers).length > 0 && (
                <div className="flex flex-col py-1 border-b border-hairline space-y-1">
                  <span className="text-ink-tertiary">Auth Headers:</span>
                  <span className="text-ink text-[10px] bg-surface-2 p-1.5 rounded font-mono block overflow-x-auto whitespace-pre">
                    {JSON.stringify(selectedEndpoint.auth_headers, null, 2)}
                  </span>
                </div>
              )}

              {(selectedEndpoint.max_retries !== undefined || selectedEndpoint.backoff_base !== undefined) && (
                <div className="flex justify-between py-1 border-b border-hairline">
                  <span className="text-ink-tertiary">Retry Policy:</span>
                  <span className="text-ink">
                    Max: {selectedEndpoint.max_retries ?? "10"} | Base: {selectedEndpoint.backoff_base ?? "2"}s
                  </span>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => handleDeleteEndpoint(selectedEndpoint.id)}
                className="bg-red-950/20 hover:bg-red-900/30 text-red-400 hover:text-red-300 font-medium text-xs py-1.5 px-3 rounded border border-red-900/30 hover:border-red-800/50 transition-colors flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Endpoint</span>
              </button>
            </div>
          </section>
        )}
      </main>

      {/* 3. Slide-out drawer inspect panel (From Right) */}
      <div 
        className={`fixed top-0 right-0 h-full w-[500px] bg-surface-1 border-l border-hairline z-50 transform transition-transform duration-200 ease-in-out shadow-2xl flex flex-col ${
          selectedLog ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selectedLog && (
          <>
            {/* Drawer Header */}
            <div className="h-[56px] border-b border-hairline bg-surface-2 flex items-center justify-between px-6 shrink-0">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm text-ink">Payload Inspector</span>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded bg-surface-1 border border-hairline hover:bg-surface-3 text-ink-subtle hover:text-ink transition-colors duration-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Delivery Stats Box */}
              <div className="bg-surface-2 border border-hairline rounded-lg p-4 font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-ink-subtle">Log Event ID:</span>
                  <span className="text-ink truncate max-w-[200px]">{selectedLog.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-subtle">Status:</span>
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${
                    selectedLog.delivery_status === "success" 
                      ? "bg-emerald-500/10 text-success border-emerald-500/20" 
                      : selectedLog.delivery_status === "failed" 
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                        : "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}>
                    {selectedLog.delivery_status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-subtle">HTTP Response Code:</span>
                  <span className={selectedLog.response_code && selectedLog.response_code >= 200 && selectedLog.response_code < 300 ? "text-success" : "text-red-400"}>
                    {selectedLog.response_code || "— (No Response)"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-subtle">Retry Loops:</span>
                  <span className="text-ink">Attempt {selectedLog.retry_count} / 10</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-subtle">Delivery Time:</span>
                  <span className="text-ink">{new Date(selectedLog.created_at).toUTCString()}</span>
                </div>
              </div>

              {/* Error messages if any */}
              {selectedLog.error_message && (
                <div className="p-4 bg-red-950/20 border border-red-900/40 rounded-lg space-y-1">
                  <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                    Error Log / Retry Info
                  </h4>
                  <p className="text-xs text-red-300 font-mono leading-relaxed">
                    {selectedLog.error_message}
                  </p>
                </div>
              )}

              {/* Headers JSON Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">
                  Request Headers
                </h4>
                <div className="bg-canvas border border-hairline rounded-lg p-4 max-h-[200px] overflow-y-auto font-mono text-[11px] leading-relaxed text-emerald-400">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.headers_json, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Payload Raw Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">
                  Ingested Body String ( cryptographic preserve )
                </h4>
                <div className="bg-canvas border border-hairline rounded-lg p-4 overflow-x-auto font-mono text-[11px] leading-relaxed text-blue-300">
                  <pre className="whitespace-pre-wrap">
                    {(() => {
                      try {
                        const parsed = JSON.parse(selectedLog.payload_string);
                        return JSON.stringify(parsed, null, 2);
                      } catch {
                        return selectedLog.payload_string;
                      }
                    })()}
                  </pre>
                </div>
              </div>

            </div>
          </>
        )}
      </div>

      {/* 4. Slide-out drawer inspect panel for Incidents (From Right) */}
      <div 
        className={`fixed top-0 right-0 h-full w-[500px] bg-surface-1 border-l border-hairline z-50 transform transition-transform duration-200 ease-in-out shadow-2xl flex flex-col ${
          selectedIncident ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selectedIncident && (
          <>
            {/* Drawer Header */}
            <div className="h-[56px] border-b border-hairline bg-surface-2 flex items-center justify-between px-6 shrink-0">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm text-ink">Incident Details</span>
              </div>
              <button 
                onClick={() => setSelectedIncident(null)}
                className="p-1 rounded bg-surface-1 border border-hairline hover:bg-surface-3 text-ink-subtle hover:text-ink transition-colors duration-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Properties Box */}
              <div className="bg-surface-2 border border-hairline rounded-lg p-4 font-mono text-xs space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-ink-subtle">Status:</span>
                  <select 
                    value={selectedIncident.status}
                    onChange={(e) => handleUpdateIncident(selectedIncident.id, { status: e.target.value as any })}
                    className="bg-canvas text-ink text-xs rounded border border-hairline px-2 py-1 focus:outline-none focus:border-primary"
                  >
                    <option value="todo">Todo</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done (Resolved)</option>
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-ink-subtle">Priority:</span>
                  <select 
                    value={selectedIncident.priority}
                    onChange={(e) => handleUpdateIncident(selectedIncident.id, { priority: e.target.value as any })}
                    className="bg-canvas text-ink text-xs rounded border border-hairline px-2 py-1 focus:outline-none focus:border-primary"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-ink-subtle">Assignee:</span>
                  <div className="flex items-center space-x-2">
                    <input 
                      type="text" 
                      placeholder="Unassigned" 
                      value={assigneeInput}
                      onChange={(e) => setAssigneeInput(e.target.value)}
                      onBlur={() => handleUpdateIncident(selectedIncident.id, { assignee: assigneeInput.trim() })}
                      className="bg-canvas text-ink text-xs rounded border border-hairline px-2 py-1 w-32 focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Title & Description */}
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-ink leading-tight">{selectedIncident.title}</h3>
                <div className="text-xs text-ink-muted bg-surface-2 border border-hairline rounded p-4 whitespace-pre-wrap font-mono leading-relaxed">
                  {selectedIncident.description}
                </div>
              </div>

              {/* Comments Section */}
              <div className="space-y-4 pt-4 border-t border-hairline">
                <h4 className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">Comments Stream</h4>
                
                <div className="space-y-3">
                  {incidentComments.length === 0 ? (
                    <p className="text-[11px] text-ink-tertiary italic">No updates or comments posted yet.</p>
                  ) : (
                    incidentComments.map(c => (
                      <div key={c.id} className="bg-surface-2 border border-hairline rounded p-3 text-xs space-y-1">
                        <div className="flex justify-between text-[10px] text-ink-tertiary">
                          <span className="font-semibold text-primary">{c.commenter}</span>
                          <span>{new Date(c.created_at).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-ink-muted leading-relaxed font-sans">{c.body}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Post comment form */}
                <form onSubmit={handlePostComment} className="space-y-2 pt-2">
                  <div className="flex space-x-2">
                    <input 
                      type="text" 
                      placeholder="Your name..." 
                      value={commenterName}
                      onChange={(e) => setCommenterName(e.target.value)}
                      className="bg-surface-2 text-ink text-xs rounded border border-hairline px-2.5 py-1.5 focus:outline-none w-1/3"
                    />
                    <input 
                      id="comment-body-input"
                      type="text" 
                      placeholder="Add status notes or debugging comment..." 
                      value={newCommentBody}
                      onChange={(e) => setNewCommentBody(e.target.value)}
                      required
                      className="bg-surface-2 text-ink text-xs rounded border border-hairline px-2.5 py-1.5 focus:outline-none flex-1"
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/30 text-xs rounded font-medium py-1.5 transition-colors"
                  >
                    Post Comment
                  </button>
                </form>
              </div>

            </div>
          </>
        )}
      </div>

      {/* 5. Command Menu Overlay (Ctrl+K) */}
      {showCommandMenu && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCommandMenu(false)}
          />
          
          {/* Command Menu Card */}
          <div className="bg-surface-1 border border-hairline w-full max-w-lg rounded-lg shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[350px]">
            {/* Search Input */}
            <div className="flex items-center px-4 py-3 border-b border-hairline">
              <Search className="w-4 h-4 text-ink-subtle shrink-0 mr-3" />
              <input 
                type="text" 
                placeholder="Type a command or search endpoints..." 
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                autoFocus
                className="bg-transparent text-ink text-sm w-full focus:outline-none"
              />
              <span className="text-[10px] bg-surface-3 border border-hairline text-ink-tertiary px-1.5 py-0.5 rounded font-mono uppercase">
                esc
              </span>
            </div>

            {/* Filtered Items */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <div className="text-[10px] text-ink-tertiary px-2 py-1 uppercase font-semibold">Commands</div>
              
              {/* Static Commands */}
              {[
                { label: "Switch to Live Event Logs", shortcut: "L", action: () => setActiveTab("logs") },
                { label: "Switch to Incident Kanban Board", shortcut: "B", action: () => setActiveTab("board") },
                { label: "Scroll to top", shortcut: "Home", action: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
                { label: "Log out", shortcut: "Ctrl+Q", action: handleLogout }
              ].filter(c => c.label.toLowerCase().includes(commandQuery.toLowerCase())).map((cmd, i) => (
                <div 
                  key={i}
                  onClick={() => { cmd.action(); setShowCommandMenu(false); setCommandQuery(""); }}
                  className="flex justify-between items-center px-2 py-1.5 rounded hover:bg-primary/10 text-xs text-ink cursor-pointer hover:text-primary transition-colors"
                >
                  <span>{cmd.label}</span>
                  <kbd className="text-[9px] bg-surface-3 border border-hairline text-ink-tertiary px-1 rounded font-mono uppercase">{cmd.shortcut}</kbd>
                </div>
              ))}

              {/* Dynamic Endpoint Search Results */}
              {endpoints.length > 0 && (
                <>
                  <div className="text-[10px] text-ink-tertiary px-2 py-1 uppercase font-semibold mt-2">Endpoints</div>
                  {endpoints.filter(e => e.slug.toLowerCase().includes(commandQuery.toLowerCase()) || e.source_name.toLowerCase().includes(commandQuery.toLowerCase())).map((ep) => (
                    <div 
                      key={ep.id}
                      onClick={() => { setSelectedEndpoint(ep); setShowCommandMenu(false); setCommandQuery(""); }}
                      className="flex justify-between items-center px-2 py-1.5 rounded hover:bg-primary/10 text-xs text-ink cursor-pointer hover:text-primary transition-colors"
                    >
                      <span className="truncate">{ep.source_name}</span>
                      <span className="text-[10px] font-mono text-ink-tertiary">/p/{ep.slug}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Keyboard Shortcuts Reference Modal (?) */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowShortcutsModal(false)}
          />
          
          {/* Shortcuts Card */}
          <div className="bg-surface-1 border border-hairline w-full max-w-md rounded-lg shadow-2xl overflow-hidden relative z-10 flex flex-col p-5 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-hairline">
              <span className="font-semibold text-sm text-ink flex items-center space-x-2">
                <span>Keyboard Shortcuts</span>
              </span>
              <button 
                onClick={() => setShowShortcutsModal(false)}
                className="text-[10px] bg-surface-3 hover:bg-surface-2 border border-hairline text-ink-tertiary px-1.5 py-0.5 rounded font-mono uppercase transition-colors"
              >
                esc
              </button>
            </div>
            
            <div className="space-y-4 text-xs">
              <div className="space-y-2">
                <h4 className="text-[10px] text-ink-tertiary uppercase font-semibold tracking-wider">Navigation</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-ink-subtle">Switch to Event Logs</span>
                    <kbd className="text-[10px] bg-surface-3 border border-hairline text-ink-tertiary px-1.5 py-0.5 rounded font-mono uppercase">L</kbd>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-ink-subtle">Switch to Incident Board</span>
                    <kbd className="text-[10px] bg-surface-3 border border-hairline text-ink-tertiary px-1.5 py-0.5 rounded font-mono uppercase">B</kbd>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-[10px] text-ink-tertiary uppercase font-semibold tracking-wider">Interface</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-ink-subtle">Open Command Menu</span>
                    <kbd className="text-[10px] bg-surface-3 border border-hairline text-ink-tertiary px-1.5 py-0.5 rounded font-mono uppercase">Ctrl + K</kbd>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-ink-subtle">Toggle Shortcuts Help</span>
                    <kbd className="text-[10px] bg-surface-3 border border-hairline text-ink-tertiary px-1.5 py-0.5 rounded font-mono uppercase">?</kbd>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-ink-subtle">Close Modals / Drawer</span>
                    <kbd className="text-[10px] bg-surface-3 border border-hairline text-ink-tertiary px-1.5 py-0.5 rounded font-mono uppercase">esc</kbd>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[10px] text-ink-tertiary uppercase font-semibold tracking-wider">Incident Details (When open)</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-ink-subtle">Focus comment input</span>
                    <kbd className="text-[10px] bg-surface-3 border border-hairline text-ink-tertiary px-1.5 py-0.5 rounded font-mono uppercase">C</kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

