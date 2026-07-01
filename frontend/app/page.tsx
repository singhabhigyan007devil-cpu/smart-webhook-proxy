"use client";

function extractError(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e: any) => e.msg ?? e.message ?? String(e)).join("; ");
  if (detail && typeof detail === "object" && "message" in (detail as any)) return (detail as any).message;
  return fallback;
}

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
  Copy, 
  Check, 
  LogOut,
  AlertTriangle,
  Keyboard,
  Compass,
  Bell,
  BarChart2,
  Settings,
  Bug,
  CheckSquare,
  Bookmark
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import AuthScreen from "./components/AuthScreen";

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
  idempotency_strategy?: string;
  idempotency_ttl?: number;
}

interface WorkflowStatus {
  id: string;
  user_id: string;
  name: string;
  color: string;
  order_index: number;
  created_at: string;
}

interface CustomField {
  id: string;
  user_id: string;
  name: string;
  field_type: "text" | "number" | "date";
  created_at: string;
}

interface IssueCustomValue {
  id: string;
  issue_id: string;
  field_id: string;
  value_text: string;
  created_at: string;
}

interface Incident {
  id: string;
  endpoint_id: string | null;
  project_id: string | null;
  issue_type: "incident" | "story" | "task" | "bug";
  title: string;
  description: string | null;
  status: string;
  priority: string;
  story_points: number | null;
  assignee: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  custom_values: IssueCustomValue[];
}

interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: "backlog" | "started" | "completed" | "paused";
  target_date: string | null;
  created_at: string;
}

interface ProjectMilestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: "open" | "completed";
  target_date: string;
  created_at: string;
}

interface IncidentComment {
  id: string;
  issue_id: string;
  commenter: string;
  body: string;
  created_at: string;
}

interface AlertChannel {
  id: string;
  user_id: string;
  name: string;
  channel_type: "slack" | "discord" | "email";
  config: {
    webhook_url?: string;
    recipient_email?: string;
  };
  is_active: boolean;
  created_at: string;
}

interface SeverityPriority {
  id: string;
  user_id: string;
  name: string;
  color: string;
  rank: number;
  threshold_failures: number;
  alert_channel_id: string | null;
  created_at: string;
}

interface AnalyticsKPIs {
  total_volume: number;
  success_rate: number;
  avg_latency_ms: number;
}

interface AnalyticsTimeSeriesPoint {
  date: string;
  success_count: number;
  failed_count: number;
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
  const [draggedOverCol, setDraggedOverCol] = useState<string | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  
  // Board Filters
  const [boardSearchQuery, setBoardSearchQuery] = useState("");
  const [boardPriorityFilter, setBoardPriorityFilter] = useState("all");
  const [boardAssigneeFilter, setBoardAssigneeFilter] = useState("all");
  
  // Projects & Roadmaps States
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectStatusInput, setProjectStatusInput] = useState<"backlog" | "started" | "completed" | "paused">("started");
  const [projectTargetDate, setProjectTargetDate] = useState("");
  const [projectCreateError, setProjectCreateError] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Milestones States
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [showCreateMilestoneModal, setShowCreateMilestoneModal] = useState(false);
  const [milestoneName, setMilestoneName] = useState("");
  const [milestoneDescription, setMilestoneDescription] = useState("");
  const [milestoneTargetDate, setMilestoneTargetDate] = useState("");
  const [milestoneProjectID, setMilestoneProjectID] = useState("");
  const [isCreatingMilestone, setIsCreatingMilestone] = useState(false);
  const [milestoneCreateError, setMilestoneCreateError] = useState("");

  // Roadmap/Timeline View State
  const [roadmapViewMode, setRoadmapViewMode] = useState<"list" | "timeline">("list");
  // Custom Workflow Statuses & Custom Fields States
  const [workflowStatuses, setWorkflowStatuses] = useState<WorkflowStatus[]>([]);
  const [showCreateStatusModal, setShowCreateStatusModal] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#718096");
  const [newStatusOrderIndex, setNewStatusOrderIndex] = useState(0);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [statusCreateError, setStatusCreateError] = useState("");

  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showCreateFieldModal, setShowCreateFieldModal] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number" | "date">("text");
  const [isSavingField, setIsSavingField] = useState(false);
  const [fieldCreateError, setFieldCreateError] = useState("");

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<"logs" | "board" | "roadmaps" | "alerts" | "analytics">("logs");

  // Analytics States
  const [analyticsKPIs, setAnalyticsKPIs] = useState<AnalyticsKPIs | null>(null);
  const [analyticsTimeSeries, setAnalyticsTimeSeries] = useState<AnalyticsTimeSeriesPoint[]>([]);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [analyticsDaysFilter, setAnalyticsDaysFilter] = useState(30);

  // Alert Channels States
  const [alertChannels, setAlertChannels] = useState<AlertChannel[]>([]);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"slack" | "discord" | "email">("slack");
  const [newChannelWebhookUrl, setNewChannelWebhookUrl] = useState("");
  const [newChannelEmail, setNewChannelEmail] = useState("");
  const [isTestingChannelId, setIsTestingChannelId] = useState<string | null>(null);
  const [isSavingChannel, setIsSavingChannel] = useState(false);
  const [channelCreateError, setChannelCreateError] = useState("");
  const [confirmDeleteChannelId, setConfirmDeleteChannelId] = useState<string | null>(null);

  // Severity Priorities States
  const [severityPriorities, setSeverityPriorities] = useState<SeverityPriority[]>([]);
  const [showCreatePriorityModal, setShowCreatePriorityModal] = useState(false);
  const [newPriorityName, setNewPriorityName] = useState("");
  const [newPriorityColor, setNewPriorityColor] = useState("hsl(0, 85%, 60%)");
  const [newPriorityRank, setNewPriorityRank] = useState(1);
  const [newPriorityThreshold, setNewPriorityThreshold] = useState(5);
  const [newPriorityChannelId, setNewPriorityChannelId] = useState<string>("none");
  const [isSavingPriority, setIsSavingPriority] = useState(false);
  const [priorityCreateError, setPriorityCreateError] = useState("");
  const [confirmDeletePriorityId, setConfirmDeletePriorityId] = useState<string | null>(null);

  
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
  const [idempotencyStrategyInput, setIdempotencyStrategyInput] = useState("auto");
  const [idempotencyTTLInput, setIdempotencyTTLInput] = useState("24");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("hookshield_api_key");
    setApiKey(null);
    setUser(null);
    setEndpoints([]);
    setLogs([]);
    setIncidents([]);
    setAlertChannels([]);
    setSeverityPriorities([]);
    setSelectedEndpoint(null);
    setSelectedLog(null);
    setSelectedIncident(null);
  }, []);

  const fetchProfile = useCallback(async (key: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${key}`
        }
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
  }, [handleLogout]);

  // Load Auth state
  useEffect(() => {
    const savedKey = localStorage.getItem("hookshield_api_key");
    if (savedKey) {
      setTimeout(() => {
        setApiKey(savedKey);
        fetchProfile(savedKey);
      }, 0);
    }
  }, [fetchProfile]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setIsLoading(true);
    setAuthError("");
    try {
      // Connect endpoint handles both email (auto-register) and API key
      const response = await fetch(`${API_BASE}/api/auth/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: emailInput.trim() })
      });
      
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem("hookshield_api_key", data.api_key);
        setApiKey(data.api_key);
        setUser(data);
      } else {
        const errData = await response.json();
        setAuthError(extractError(errData.detail, "Authentication failed. Enter email to register or paste your API key."));
      }
    } catch {
      setAuthError("Unable to connect to backend service. Please check that FastAPI is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const getPriorityStyle = (priorityName: string) => {
    const cp = severityPriorities.find(p => p.name.toLowerCase() === priorityName.toLowerCase());
    if (cp) {
      const cleanColor = cp.color.trim();
      const match = cleanColor.match(/hsl\(([^)]+)\)/);
      if (match) {
        const values = match[1];
        return {
          style: {
            borderColor: `hsla(${values}, 0.3)`,
            color: cleanColor,
            backgroundColor: `hsla(${values}, 0.15)`
          },
          className: "border px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold"
        };
      }
      return {
        style: {
          borderColor: cleanColor,
          color: cleanColor,
          backgroundColor: cleanColor + "20"
        },
        className: "border px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold"
      };
    }
    let badgeClass = "border border-hairline text-ink-subtle bg-surface-2";
    const p = priorityName.toLowerCase();
    if (p === "urgent") badgeClass = "border border-red-500/30 text-red-400 bg-red-950/20";
    else if (p === "high") badgeClass = "border border-orange-500/30 text-orange-400 bg-orange-950/20";
    else if (p === "medium") badgeClass = "border border-amber-500/30 text-amber-400 bg-amber-950/20";
    return { className: `${badgeClass} text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded` };
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

      // 4. Fetch Webhook Issues
      const incRes = await fetch(`${API_BASE}/api/issues`, { headers });
      if (incRes.ok) {
        const data = await incRes.json();
        setIncidents(data);
      }

      // 5. Fetch Projects
      const projRes = await fetch(`${API_BASE}/api/projects`, { headers });
      if (projRes.ok) {
        const data = await projRes.json();
        setProjects(data);
        // Fetch Milestones for each project
        const milestonePromises = data.map((proj: Project) =>
          fetch(`${API_BASE}/api/projects/${proj.id}/milestones`, { headers })
            .then(res => res.ok ? res.json() : [])
        );
        const milestonesResults = await Promise.all(milestonePromises);
        const allMilestones = milestonesResults.flat();
        setMilestones(allMilestones);
      }

      // 6. Fetch Alert Channels
      const channelsRes = await fetch(`${API_BASE}/api/alert-channels`, { headers });
      if (channelsRes.ok) {
        const data = await channelsRes.json();
        setAlertChannels(data);
      }

      // 7. Fetch Severity Priorities
      const prioritiesRes = await fetch(`${API_BASE}/api/severity-priorities`, { headers });
      if (prioritiesRes.ok) {
        const data = await prioritiesRes.json();
        setSeverityPriorities(data);
      }

      // 8. Fetch Workflow Statuses
      const wsRes = await fetch(`${API_BASE}/api/workflow-statuses`, { headers });
      if (wsRes.ok) {
        const data = await wsRes.json();
        setWorkflowStatuses(data);
      }

      // 9. Fetch Custom Fields
      const cfRes = await fetch(`${API_BASE}/api/custom-fields`, { headers });
      if (cfRes.ok) {
        const data = await cfRes.json();
        setCustomFields(data);
      }
    } catch (err) {
      console.error("Error polling backend dashboard data", err);
    }
  }, [apiKey]);

  const fetchAnalytics = useCallback(async () => {
    if (!apiKey) return;
    setIsLoadingAnalytics(true);
    try {
      const headers = { "Authorization": `Bearer ${apiKey}` };
      const [kpiRes, tsRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics/kpis`, { headers }),
        fetch(`${API_BASE}/api/analytics/timeseries?days=${analyticsDaysFilter}`, { headers })
      ]);
      
      if (kpiRes.ok) {
        setAnalyticsKPIs(await kpiRes.json());
      }
      if (tsRes.ok) {
        const tsData = await tsRes.json();
        setAnalyticsTimeSeries(tsData.data || []);
      }
    } catch (err) {
      console.error("Error fetching analytics", err);
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [apiKey, analyticsDaysFilter]);

  // Comments & Incident Mutator functions
  const fetchIncidentComments = useCallback(async (incidentId: string) => {
    if (!apiKey) return;
    try {
      const headers = { "Authorization": `Bearer ${apiKey}` };
      const response = await fetch(`${API_BASE}/api/issues/${incidentId}/comments`, { headers });
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
      setTimeout(() => {
        fetchIncidentComments(selectedIncident.id);
        setAssigneeInput(selectedIncident.assignee || "");
      }, 0);
    } else {
      setTimeout(() => {
        setIncidentComments([]);
      }, 0);
    }
  }, [selectedIncident, fetchIncidentComments]);

  useEffect(() => {
    if (activeTab === "analytics") {
      setTimeout(() => {
        fetchAnalytics();
      }, 0);
    }
  }, [activeTab, fetchAnalytics, analyticsDaysFilter]);

  const handleUpdateIncident = async (id: string, updates: Partial<Incident>) => {
    if (!apiKey) return;
    try {
      const response = await fetch(`${API_BASE}/api/issues/${id}`, {
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
      const response = await fetch(`${API_BASE}/api/issues/${selectedIncident.id}/comments`, {
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

  const handleCreateWorkflowStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatusName.trim() || !apiKey) return;
    setIsSavingStatus(true);
    setStatusCreateError("");
    try {
      const response = await fetch(`${API_BASE}/api/workflow-statuses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: newStatusName.trim(),
          color: newStatusColor,
          order_index: newStatusOrderIndex
        })
      });
      if (response.ok) {
        setNewStatusName("");
        setNewStatusColor("#718096");
        setNewStatusOrderIndex(0);
        setShowCreateStatusModal(false);
        fetchData();
      } else {
        const errData = await response.json();
        setStatusCreateError(extractError(errData.detail, "Failed to create workflow status"));
      }
    } catch {
      setStatusCreateError("Network error occurred");
    } finally {
      setIsSavingStatus(false);
    }
  };

  const handleDeleteWorkflowStatus = async (statusId: string) => {
    if (!apiKey) return;
    try {
      const response = await fetch(`${API_BASE}/api/workflow-statuses/${statusId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to delete workflow status", err);
    }
  };

  const handleCreateCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim() || !apiKey) return;
    setIsSavingField(true);
    setFieldCreateError("");
    try {
      const response = await fetch(`${API_BASE}/api/custom-fields`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: newFieldName.trim(),
          field_type: newFieldType
        })
      });
      if (response.ok) {
        setNewFieldName("");
        setNewFieldType("text");
        setShowCreateFieldModal(false);
        fetchData();
      } else {
        const errData = await response.json();
        setFieldCreateError(extractError(errData.detail, "Failed to create custom field"));
      }
    } catch {
      setFieldCreateError("Network error occurred");
    } finally {
      setIsSavingField(false);
    }
  };

  const handleDeleteCustomField = async (fieldId: string) => {
    if (!apiKey) return;
    try {
      const response = await fetch(`${API_BASE}/api/custom-fields/${fieldId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to delete custom field", err);
    }
  };

  const handleSaveCustomFieldValue = async (issueId: string, fieldId: string, valText: string) => {
    if (!apiKey) return;
    try {
      await fetch(`${API_BASE}/api/issues/${issueId}/custom-values`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          field_id: fieldId,
          value_text: valText
        })
      });
      fetchData();
    } catch (err) {
      console.error("Failed to save custom field value", err);
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
      
      // 5. b/l/r -> Navigation (only if nothing is open)
      if (!isInputActive && !showCommandMenuRef.current && !showShortcutsModalRef.current) {
        if (e.key.toLowerCase() === "b" || e.code === "KeyB") {
          setActiveTab("board");
        }
        if (e.key.toLowerCase() === "l" || e.code === "KeyL") {
          setActiveTab("logs");
        }
        if (e.key.toLowerCase() === "r" || e.code === "KeyR") {
          setActiveTab("roadmaps");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);


  // Real-Time WebSockets connection
  useEffect(() => {
    if (!apiKey) return;

    const wsUrl = API_BASE.replace(/^http/, "ws") + "/ws/dashboard";
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      console.log("[WS] Connecting to backend at", wsUrl);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[WS] Connected to dashboard live events");
      };

      ws.onmessage = (event) => {
        try {
          if (event.data === "pong") return;
          const message = JSON.parse(event.data);
          console.log("[WS] Received real-time event:", message.event, message.data);
          
          if (message.event === "issue_created") {
            const newIncident = message.data;
            setIncidents(prev => {
              if (prev.some(i => i.id === newIncident.id)) return prev;
              return [newIncident, ...prev];
            });
            fetchData();
          } 
          
          else if (message.event === "issue_updated") {
            const updated = message.data;
            setIncidents(prev => prev.map(i => i.id === updated.id ? updated : i));
            setSelectedIncident(prev => {
              if (prev?.id === updated.id) {
                setAssigneeInput(updated.assignee || "");
                return updated;
              }
              return prev;
            });
            fetchData();
          } 
          
          else if (message.event === "project_created") {
            const newProj = message.data;
            setProjects(prev => {
              if (prev.some(p => p.id === newProj.id)) return prev;
              return [newProj, ...prev];
            });
            fetchData();
          } 
          
          else if (message.event === "project_updated") {
            const updated = message.data;
            setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
            fetchData();
          } 
          
          else if (message.event === "project_deleted") {
            const { id } = message.data;
            setProjects(prev => prev.filter(p => p.id !== id));
            setIncidents(prev => prev.map(i => i.project_id === id ? { ...i, project_id: null } : i));
            fetchData();
          }          
          else if (message.event === "milestone_created") {
            const newMilestone = message.data;
            setMilestones(prev => {
              if (prev.some(m => m.id === newMilestone.id)) return prev;
              return [...prev, newMilestone];
            });
            fetchData();
          }
          else if (message.event === "milestone_updated") {
            const updated = message.data;
            setMilestones(prev => prev.map(m => m.id === updated.id ? updated : m));
            fetchData();
          }
          else if (message.event === "milestone_deleted") {
            const { id } = message.data;
            setMilestones(prev => prev.filter(m => m.id !== id));
            fetchData();
          }
          else if (message.event === "alert_channel_created") {
            const newChannel = message.data;
            setAlertChannels(prev => {
              if (prev.some(c => c.id === newChannel.id)) return prev;
              return [newChannel, ...prev];
            });
            fetchData();
          }
          else if (message.event === "alert_channel_updated") {
            const updated = message.data;
            setAlertChannels(prev => prev.map(c => c.id === updated.id ? updated : c));
            fetchData();
          }
          else if (message.event === "alert_channel_deleted") {
            const { id } = message.data;
            setAlertChannels(prev => prev.filter(c => c.id !== id));
            fetchData();
          }
          else if (message.event === "severity_priority_created") {
            const newPri = message.data;
            setSeverityPriorities(prev => {
              if (prev.some(p => p.id === newPri.id)) return prev;
              return [...prev, newPri].sort((a, b) => a.rank - b.rank);
            });
            fetchData();
          }
          else if (message.event === "severity_priority_updated") {
            const updated = message.data;
            setSeverityPriorities(prev => prev.map(p => p.id === updated.id ? updated : p).sort((a, b) => a.rank - b.rank));
            fetchData();
          }
          else if (message.event === "severity_priority_deleted") {
            const { id } = message.data;
            setSeverityPriorities(prev => prev.filter(p => p.id !== id));
            fetchData();
          }
          else if (message.event === "comment_created") {
            const newComment = message.data;
            setSelectedIncident(prevSelected => {
              if (prevSelected?.id === newComment.issue_id) {
                setIncidentComments(prevComments => {
                  if (prevComments.some(c => c.id === newComment.id)) return prevComments;
                  return [...prevComments, newComment];
                });
              }
              return prevSelected;
            });
          }
          else if (message.event === "workflow_status_created") {
            const newStatus = message.data;
            setWorkflowStatuses(prev => {
              if (prev.some(s => s.id === newStatus.id)) return prev;
              return [...prev, newStatus].sort((a, b) => a.order_index - b.order_index);
            });
            fetchData();
          }
          else if (message.event === "workflow_status_updated") {
            const updated = message.data;
            setWorkflowStatuses(prev => prev.map(s => s.id === updated.id ? updated : s).sort((a, b) => a.order_index - b.order_index));
            fetchData();
          }
          else if (message.event === "workflow_status_deleted") {
            const { id } = message.data;
            setWorkflowStatuses(prev => prev.filter(s => s.id !== id));
            fetchData();
          }
          else if (message.event === "custom_field_created") {
            const newField = message.data;
            setCustomFields(prev => {
              if (prev.some(f => f.id === newField.id)) return prev;
              return [...prev, newField];
            });
            fetchData();
          }
          else if (message.event === "custom_field_deleted") {
            const { id } = message.data;
            setCustomFields(prev => prev.filter(f => f.id !== id));
            fetchData();
          }
        } catch (err) {
          console.error("[WS ERROR] Error parsing event payload:", err);
        }
      };

      ws.onclose = () => {
        console.log("[WS] Disconnected. Reconnecting in 3s...");
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error("[WS ERROR] Connection error:", err);
        ws?.close();
      };
    };

    connect();

    const pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, 10000);

    return () => {
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [apiKey, fetchData]);

  // Load initial data
  useEffect(() => {
    if (apiKey) {
      setTimeout(() => {
        fetchData();
      }, 0);
    }
  }, [apiKey, fetchData]);

  // --- Alert Channels CRUD Handlers ---
  const handleCreateAlertChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    setIsSavingChannel(true);
    setChannelCreateError("");
    try {
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      };
      const config: Record<string, string> = {};
      if (newChannelType === "slack" || newChannelType === "discord") {
        config["webhook_url"] = newChannelWebhookUrl.trim();
      } else if (newChannelType === "email") {
        config["recipient_email"] = newChannelEmail.trim();
      }

      const response = await fetch(`${API_BASE}/api/alert-channels`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: newChannelName.trim(),
          channel_type: newChannelType,
          config,
          is_active: true
        })
      });

      if (response.ok) {
        const data = await response.json();
        setAlertChannels(prev => [data, ...prev]);
        setShowCreateChannelModal(false);
        setNewChannelName("");
        setNewChannelWebhookUrl("");
        setNewChannelEmail("");
      } else {
        const errData = await response.json();
        setChannelCreateError(extractError(errData.detail, "Failed to create alert channel."));
      }
    } catch {
      setChannelCreateError("Connection error while creating alert channel.");
    } finally {
      setIsSavingChannel(false);
    }
  };

  const handleToggleAlertChannel = async (channelId: string, currentStatus: boolean) => {
    try {
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      };
      const response = await fetch(`${API_BASE}/api/alert-channels/${channelId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ is_active: !currentStatus })
      });
      if (response.ok) {
        const data = await response.json();
        setAlertChannels(prev => prev.map(c => c.id === channelId ? data : c));
      }
    } catch (err) {
      console.error("Failed to toggle alert channel", err);
    }
  };

  const handleDeleteAlertChannel = async (channelId: string) => {
    try {
      const headers = { "Authorization": `Bearer ${apiKey}` };
      const response = await fetch(`${API_BASE}/api/alert-channels/${channelId}`, {
        method: "DELETE",
        headers
      });
      if (response.ok) {
        setAlertChannels(prev => prev.filter(c => c.id !== channelId));
      }
    } catch (err) {
      console.error("Failed to delete alert channel", err);
    }
  };

  const handleTestAlertChannel = async (channelId: string) => {
    setIsTestingChannelId(channelId);
    try {
      const headers = { "Authorization": `Bearer ${apiKey}` };
      const response = await fetch(`${API_BASE}/api/alert-channels/${channelId}/test`, {
        method: "POST",
        headers
      });
      const data = await response.json();
      if (response.ok) {
        alert(data.message || "Test alert sent successfully!");
      } else {
        alert(data.detail || "Failed to send test alert.");
      }
    } catch {
      alert("Error sending test alert connection.");
    } finally {
      setIsTestingChannelId(null);
    }
  };

  // --- Severity Priorities CRUD Handlers ---
  const handleCreateSeverityPriority = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPriorityName.trim()) return;
    setIsSavingPriority(true);
    setPriorityCreateError("");
    try {
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      };
      const response = await fetch(`${API_BASE}/api/severity-priorities`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: newPriorityName.trim(),
          color: newPriorityColor,
          rank: Number(newPriorityRank),
          threshold_failures: Number(newPriorityThreshold),
          alert_channel_id: newPriorityChannelId === "none" ? null : newPriorityChannelId
        })
      });
      const data = await response.json();
      if (response.ok) {
        setSeverityPriorities(prev => {
          if (prev.some(p => p.id === data.id)) return prev;
          return [...prev, data].sort((a, b) => a.rank - b.rank);
        });
        setShowCreatePriorityModal(false);
        setNewPriorityName("");
        setNewPriorityColor("hsl(0, 85%, 60%)");
        setNewPriorityThreshold(5);
        setNewPriorityChannelId("none");
      } else {
        setPriorityCreateError(extractError(data.detail, "Failed to create severity priority."));
      }
    } catch {
      setPriorityCreateError("Connection error while creating severity priority.");
    } finally {
      setIsSavingPriority(false);
    }
  };

  const handleUpdateSeverityPriority = async (priorityId: string, payload: Partial<SeverityPriority>) => {
    try {
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      };
      const response = await fetch(`${API_BASE}/api/severity-priorities/${priorityId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.ok) {
        setSeverityPriorities(prev => prev.map(p => p.id === priorityId ? data : p).sort((a, b) => a.rank - b.rank));
      }
    } catch (err) {
      console.error("Failed to update severity priority", err);
    }
  };

  const handleDeleteSeverityPriority = async (priorityId: string) => {
    try {
      const headers = { "Authorization": `Bearer ${apiKey}` };
      const response = await fetch(`${API_BASE}/api/severity-priorities/${priorityId}`, {
        method: "DELETE",
        headers
      });
      if (response.ok) {
        setSeverityPriorities(prev => prev.filter(p => p.id !== priorityId));
      }
    } catch (err) {
      console.error("Failed to delete severity priority", err);
    }
  };

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
        } catch {
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
          backoff_base: backoffBaseInput ? parseInt(backoffBaseInput) : undefined,
          idempotency_strategy: idempotencyStrategyInput,
          idempotency_ttl: idempotencyTTLInput ? parseInt(idempotencyTTLInput) * 3600 : 86400
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
        setIdempotencyStrategyInput("auto");
        setIdempotencyTTLInput("24");
        fetchData();
      } else {
        const err = await response.json();
        setCreateError(extractError(err.detail, "Failed to create endpoint."));
      }
    } catch {
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

  // --- Project CRUD Handlers ---
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    setIsCreatingProject(true);
    setProjectCreateError("");
    try {
      const response = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: projectName.trim(),
          description: projectDescription.trim() || undefined,
          status: projectStatusInput,
          target_date: projectTargetDate ? new Date(projectTargetDate).toISOString() : undefined
        })
      });
      if (response.ok) {
        setProjectName("");
        setProjectDescription("");
        setProjectStatusInput("started");
        setProjectTargetDate("");
        setShowCreateProjectModal(false);
        fetchData();
      } else {
        const err = await response.json();
        setProjectCreateError(extractError(err.detail, "Failed to create project."));
      }
    } catch {
      setProjectCreateError("Error communicating with database.");
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleUpdateProject = async (id: string, updates: Partial<Project>) => {
    if (!apiKey) return;
    try {
      const response = await fetch(`${API_BASE}/api/projects/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(updates)
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to update project", err);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm("Are you sure you want to delete this project? Incident mapping will be cleared.")) return;
    try {
      const response = await fetch(`${API_BASE}/api/projects/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to delete project", err);
    }
  };

  // --- Project Milestone CRUD Handlers ---
  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!milestoneName.trim() || !milestoneProjectID || !milestoneTargetDate) return;
    setIsCreatingMilestone(true);
    setMilestoneCreateError("");
    try {
      const response = await fetch(`${API_BASE}/api/projects/${milestoneProjectID}/milestones`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: milestoneName.trim(),
          description: milestoneDescription.trim() || undefined,
          target_date: new Date(milestoneTargetDate).toISOString()
        })
      });
      if (response.ok) {
        setMilestoneName("");
        setMilestoneDescription("");
        setMilestoneTargetDate("");
        setShowCreateMilestoneModal(false);
        fetchData();
      } else {
        const err = await response.json();
        setMilestoneCreateError(extractError(err.detail, "Failed to create milestone."));
      }
    } catch {
      setMilestoneCreateError("Error communicating with database.");
    } finally {
      setIsCreatingMilestone(false);
    }
  };

  const handleUpdateMilestone = async (id: string, updates: Partial<ProjectMilestone>) => {
    if (!apiKey) return;
    try {
      const response = await fetch(`${API_BASE}/api/milestones/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(updates)
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to update milestone", err);
    }
  };

  const handleDeleteMilestone = async (id: string) => {
    if (!confirm("Are you sure you want to delete this milestone?")) return;
    try {
      const response = await fetch(`${API_BASE}/api/milestones/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to delete milestone", err);
    }
  };

  const renderTimelineView = () => {
    // Helper to generate days for current + next month
    const start = new Date();
    start.setDate(1); // 1st of current month
    start.setHours(0,0,0,0);
    
    const end = new Date();
    end.setMonth(end.getMonth() + 2); // 2 months total
    end.setDate(0); // Last day of next month
    end.setHours(23,59,59,999);
    
    const days: Date[] = [];
    const curr = new Date(start);
    while (curr <= end) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    const totalTimelineDays = days.length;

    const monthSegments: { label: string; daysCount: number }[] = [];
    days.forEach((day) => {
      const label = day.toLocaleDateString([], { month: "long", year: "numeric" });
      if (monthSegments.length === 0 || monthSegments[monthSegments.length - 1].label !== label) {
        monthSegments.push({ label, daysCount: 1 });
      } else {
        monthSegments[monthSegments.length - 1].daysCount++;
      }
    });

    return (
      <div className="flex flex-col space-y-4 bg-canvas p-4 min-h-[500px]">
        {/* Gantt Timeline Container with horizontal scroll */}
        <div className="border border-hairline rounded bg-surface-1/40 overflow-x-auto relative flex flex-col">
          
          {/* Header Row: Month / Day headers */}
          <div className="flex" style={{ minWidth: `${240 + totalTimelineDays * 24}px` }}>
            {/* Sticky Top-Left Empty Space */}
            <div className="w-60 bg-surface-2 border-r border-b border-hairline sticky left-0 z-20 shrink-0 h-16 flex items-center px-4">
              <span className="text-[10px] uppercase font-semibold text-ink-muted tracking-wider">Project Initiatives</span>
            </div>
            
            {/* Scrolling Calendar Headers */}
            <div className="flex-1 flex flex-col">
              {/* Month Header */}
              <div className="flex border-b border-hairline h-8 bg-surface-2">
                {monthSegments.map((seg, i) => (
                  <div 
                    key={i} 
                    style={{ width: seg.daysCount * 24 }}
                    className="text-center py-1.5 text-[9px] font-semibold uppercase tracking-wider text-ink-subtle border-r border-hairline last:border-r-0 h-full shrink-0 flex items-center justify-center"
                  >
                    {seg.label}
                  </div>
                ))}
              </div>
              
              {/* Day Header */}
              <div className="flex h-8 bg-surface-1">
                {days.map((day, i) => {
                  const isToday = day.toDateString() === new Date().toDateString();
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <div 
                      key={i} 
                      style={{ width: 24 }}
                      className={`text-center py-1 text-[8px] font-mono shrink-0 h-full flex items-center justify-center border-r border-hairline/20 ${
                        isToday ? "bg-primary/20 text-primary font-bold animate-pulse" : isWeekend ? "bg-surface-2/60 text-ink-tertiary" : "text-ink-muted"
                      }`}
                    >
                      {day.getDate()}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Rows: One per Project */}
          <div className="flex flex-col divide-y divide-hairline">
            {projects.map((proj) => {
              const projIncidents = incidents.filter(i => i.project_id === proj.id);
              const completedCount = projIncidents.filter(i => i.status === "done").length;
              const totalCount = projIncidents.length;
              const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
              
              // Calculate Project Bar Bounds
              const pStart = new Date(proj.created_at);
              const pEnd = proj.target_date ? new Date(proj.target_date) : null;
              
              // Determine start/end indexes
              const startDayIdx = Math.max(0, Math.floor((pStart.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
              
              // If target_date is not set, default to start day + 30 days for visualization
              const endDayIdx = pEnd 
                ? Math.min(totalTimelineDays - 1, Math.floor((pEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
                : Math.min(totalTimelineDays - 1, startDayIdx + 30);
                
              const leftPx = startDayIdx * 24;
              const widthPx = Math.max(24, (endDayIdx - startDayIdx + 1) * 24);
              const hasTargetDate = !!proj.target_date;

              const projMilestones = milestones.filter(m => m.project_id === proj.id);

              return (
                <div 
                  key={proj.id} 
                  className="flex hover:bg-surface-2/10 transition-colors" 
                  style={{ minWidth: `${240 + totalTimelineDays * 24}px` }}
                >
                  {/* Sticky left panel */}
                  <div className="w-60 bg-surface-1 border-r border-hairline sticky left-0 z-10 shrink-0 p-3 flex flex-col justify-between space-y-2">
                    <div>
                      <h4 className="text-xs font-semibold text-ink line-clamp-1">{proj.name}</h4>
                      <p className="text-[9px] text-ink-muted mt-0.5">
                        {hasTargetDate ? `Target: ${new Date(proj.target_date!).toLocaleDateString()}` : "No target date set"}
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1">
                        <span className="text-[9px] text-ink-subtle font-medium">{progressPct}%</span>
                        <div className="w-12 bg-surface-3 rounded-full h-1 overflow-hidden border border-hairline">
                          <div className="bg-primary h-full" style={{ width: `${progressPct}%` }} />
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => {
                          setMilestoneProjectID(proj.id);
                          setShowCreateMilestoneModal(true);
                        }}
                        className="text-[8px] bg-primary/10 hover:bg-primary text-primary hover:text-ink font-semibold px-1.5 py-0.5 rounded border border-primary/20 hover:border-transparent transition-all"
                      >
                        + Milestone
                      </button>
                    </div>
                  </div>

                  {/* Right Timeline Grid Row */}
                  <div className="flex-1 relative h-16 flex items-center">
                    
                    {/* Background Grid Columns for this row */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {days.map((day, idx) => {
                        const isToday = day.toDateString() === new Date().toDateString();
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                        return (
                          <div 
                            key={idx}
                            style={{ width: 24 }}
                            className={`h-full border-r border-hairline/20 shrink-0 ${
                              isToday ? "bg-primary/5 border-r border-primary/15" : isWeekend ? "bg-surface-2/20" : ""
                            }`}
                          />
                        );
                      })}
                    </div>

                    {/* Timeline Track Bar */}
                    <div 
                      style={{ left: leftPx, width: widthPx }}
                      className={`absolute h-7 rounded flex items-center px-2 text-[9px] font-medium transition-all ${
                        hasTargetDate 
                          ? "bg-primary/15 border border-primary/30 hover:bg-primary/20 text-primary shadow-sm" 
                          : "bg-surface-3/30 border border-dashed border-hairline hover:bg-surface-3/40 text-ink-subtle"
                      }`}
                    >
                      <span className="truncate">{proj.name} ({progressPct}%)</span>
                    </div>

                    {/* Milestones Flag Markers */}
                    {projMilestones.map((m) => {
                      const mDate = new Date(m.target_date);
                      const mIdx = Math.floor((mDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                      if (mIdx < 0 || mIdx >= totalTimelineDays) return null;
                      const mLeft = mIdx * 24 + 5; 
                      const isCompleted = m.status === "completed";

                      return (
                        <div 
                          key={m.id}
                          style={{ left: mLeft }}
                          className="absolute z-10 group flex flex-col items-center cursor-pointer"
                        >
                          {/* Vertical guide line */}
                          <div className={`w-[1px] h-14 border-l border-dashed -mt-4 ${
                            isCompleted ? "border-emerald-500/40" : "border-amber-500/40"
                          }`} />
                          
                          {/* Flag Diamond/Marker */}
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Mark milestone "${m.name}" as ${isCompleted ? "open" : "completed"}?`)) {
                                handleUpdateMilestone(m.id, { status: isCompleted ? "open" : "completed" });
                              }
                            }}
                            className={`w-3.5 h-3.5 -mt-10 rotate-45 border flex items-center justify-center shadow-md transition-all ${
                              isCompleted 
                                ? "bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-400" 
                                : "bg-amber-500 border-amber-600 text-white hover:bg-amber-400"
                            }`}
                            title={`${m.name} (${m.status}) - Click to toggle status`}
                          >
                            <span className="-rotate-45 text-[7px] font-bold">M</span>
                          </div>

                          {/* Hover Tooltip */}
                          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col bg-surface-1 border border-hairline shadow-xl rounded p-2 z-50 text-[10px] w-40 text-ink font-sans space-y-1">
                            <div className="font-semibold truncate text-primary">{m.name}</div>
                            {m.description && <div className="text-ink-subtle text-[9px] line-clamp-2 leading-relaxed">{m.description}</div>}
                            <div className="flex justify-between items-center pt-1 border-t border-hairline text-[8px] text-ink-tertiary">
                              <span>{new Date(m.target_date).toLocaleDateString()}</span>
                              <span className={`uppercase font-bold ${isCompleted ? "text-emerald-500" : "text-amber-500"}`}>{m.status}</span>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMilestone(m.id);
                              }}
                              className="text-red-400 hover:text-red-300 font-semibold text-[8px] text-left pt-1 block hover:underline"
                            >
                              Delete Milestone
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Mapped Incident Webhook Failures */}
                    {projIncidents.map((inc) => {
                      const incDate = new Date(inc.created_at);
                      const incIdx = Math.floor((incDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                      if (incIdx < 0 || incIdx >= totalTimelineDays) return null;
                      const incLeft = incIdx * 24 + 7; 

                      return (
                        <div 
                          key={inc.id}
                          style={{ left: incLeft }}
                          onClick={() => setSelectedIncident(inc)}
                          className="absolute z-10 group cursor-pointer"
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 border border-red-600 animate-pulse shadow-sm hover:scale-125 transition-transform" />
                          
                          {/* Incident Hover Tooltip */}
                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col bg-surface-1 border border-hairline shadow-xl rounded p-2 z-50 text-[10px] w-44 text-ink font-sans space-y-1">
                            <div className="font-semibold text-red-400 truncate">Webhook Failure</div>
                            <div className="text-ink line-clamp-2 leading-tight">{inc.title}</div>
                            <div className="flex justify-between items-center pt-1 border-t border-hairline text-[8px] text-ink-tertiary font-mono">
                              <span>Priority: {inc.priority}</span>
                              <span>{inc.status}</span>
                            </div>
                            <div className="text-[8px] text-ink-tertiary italic">{new Date(inc.created_at).toLocaleDateString()}</div>
                          </div>
                        </div>
                      );
                    })}

                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    );
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
              className="bg-surface-2 text-ink text-xs rounded border border-hairline px-2 py-1.5 focus:outline-none focus:border-primary-focus cursor-pointer uppercase"
            >
              <option value="all">All Priorities</option>
              {severityPriorities.length > 0 ? (
                severityPriorities.map(p => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))
              ) : (
                <>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </>
              )}
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

  const renderAlertChannelsTab = () => {
    return (
      <div className="flex flex-col bg-canvas min-h-[450px] p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-hairline">
          <div>
            <h3 className="text-sm font-semibold text-ink">Alert Notification Channels</h3>
            <p className="text-xs text-ink-subtle mt-0.5 font-sans">
              Route webhook proxy failures and circuit breaker triggers to messaging destinations.
            </p>
          </div>
          <button 
            onClick={() => {
              setChannelCreateError("");
              setShowCreateChannelModal(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-primary hover:bg-primary-hover active:bg-primary-focus text-xs text-ink font-semibold border border-primary-focus/50 transition-colors shadow-sm select-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Channel</span>
          </button>
        </div>

        {alertChannels.length === 0 ? (
          <div className="bg-surface-1 border border-hairline rounded-lg p-12 text-center text-ink-subtle space-y-3">
            <Bell className="w-8 h-8 mx-auto text-ink-tertiary" />
            <div className="text-sm font-medium text-ink">No Alert Channels configured</div>
            <p className="text-xs text-ink-tertiary max-w-md mx-auto">
              Configure Slack, Discord webhooks, or email recipients to receive immediate telemetry alerts when webhooks fail.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {alertChannels.map((channel) => {
              const isActive = channel.is_active;
              return (
                <div 
                  key={channel.id}
                  className="bg-surface-1 border border-hairline rounded-lg p-4 flex flex-col justify-between space-y-4 hover:border-hairline-strong transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-ink">{channel.name}</span>
                        <span className={`text-[9px] font-mono px-2 py-0.5 rounded border uppercase font-medium ${
                          channel.channel_type === "slack" 
                            ? "bg-purple-950/20 border-purple-500/30 text-purple-400" 
                            : channel.channel_type === "discord"
                            ? "bg-indigo-950/20 border-indigo-500/30 text-indigo-400"
                            : "bg-emerald-950/20 border-emerald-500/30 text-emerald-400"
                        }`}>
                          {channel.channel_type}
                        </span>
                      </div>
                      <p className="text-[10px] text-ink-tertiary truncate max-w-[280px]">
                        {channel.channel_type === "email" 
                          ? channel.config.recipient_email 
                          : channel.config.webhook_url ? `${channel.config.webhook_url.slice(0, 35)}...` : "Configured"
                        }
                      </p>
                    </div>

                    {/* Active State Toggle Switch */}
                    <button 
                      onClick={() => handleToggleAlertChannel(channel.id, channel.is_active)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isActive ? "bg-primary" : "bg-surface-3"
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isActive ? "translate-x-4" : "translate-x-0"
                      }`} />
                    </button>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-hairline">
                    <span className="text-[10px] text-ink-tertiary font-mono">
                      Added {new Date(channel.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={() => handleTestAlertChannel(channel.id)}
                        disabled={isTestingChannelId !== null}
                        className="text-[10px] bg-surface-2 border border-hairline hover:bg-surface-3 hover:border-hairline-strong text-ink-subtle hover:text-ink px-2.5 py-1 rounded font-medium transition-colors"
                      >
                        {isTestingChannelId === channel.id ? "Testing..." : "Test Alert"}
                      </button>
                      {confirmDeleteChannelId === channel.id ? (
                        <div className="flex items-center space-x-1.5 animate-in fade-in duration-200">
                          <button
                            onClick={() => {
                              handleDeleteAlertChannel(channel.id);
                              setConfirmDeleteChannelId(null);
                            }}
                            className="text-[10px] bg-red-950/40 border border-red-900/50 hover:bg-red-900/60 text-red-400 px-2 py-0.5 rounded transition-colors font-medium"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDeleteChannelId(null)}
                            className="text-[10px] bg-surface-2 border border-hairline hover:bg-surface-3 text-ink-subtle hover:text-ink px-2 py-0.5 rounded transition-colors font-medium"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setConfirmDeleteChannelId(channel.id)}
                          className="text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/5 px-2 py-1 rounded transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {renderSeverityPrioritiesSection()}
        {renderWorkflowStatusesSection()}
        {renderCustomFieldsSection()}
      </div>
    );
  };

  // --- Severity Priorities UI Rendering ---
  const renderSeverityPrioritiesSection = () => {
    return (
      <div className="flex flex-col bg-canvas p-6 space-y-6 border-t border-hairline mt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-hairline">
          <div>
            <h3 className="text-sm font-semibold text-ink">Severity-Based Auto-Escalation</h3>
            <p className="text-xs text-ink-subtle mt-0.5 font-sans">
              Map endpoint drop thresholds to specific severities, custom colors, and routed alert channels.
            </p>
          </div>
          <button 
            onClick={() => {
              setPriorityCreateError("");
              setShowCreatePriorityModal(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-primary hover:bg-primary-hover active:bg-primary-focus text-xs text-ink font-semibold border border-primary-focus/50 transition-colors shadow-sm select-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Severity Level</span>
          </button>
        </div>

        {severityPriorities.length === 0 ? (
          <div className="text-center py-6 text-ink-tertiary text-xs">
            No severity levels configured.
          </div>
        ) : (
          <div className="space-y-4">
            {severityPriorities.map((pri) => {
              const dotStyle = { backgroundColor: pri.color };
              
              return (
                <div 
                  key={pri.id}
                  className="bg-surface-1 border border-hairline rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-hairline-strong transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={dotStyle} />
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-ink uppercase tracking-wider">{pri.name}</div>
                      <div className="text-[10px] text-ink-tertiary">
                        Rank {pri.rank} • Triggers at {pri.threshold_failures} failed {pri.threshold_failures === 1 ? "attempt" : "attempts"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    {/* Inline edit threshold failures */}
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] text-ink-subtle font-sans">Failures:</span>
                      <input 
                        type="number" 
                        min="1"
                        value={pri.threshold_failures}
                        onChange={(e) => handleUpdateSeverityPriority(pri.id, { threshold_failures: parseInt(e.target.value) || 1 })}
                        className="w-12 bg-surface-2 text-ink text-xs rounded border border-hairline px-1.5 py-1 text-center focus:outline-none focus:border-primary font-mono"
                      />
                    </div>

                    {/* Inline edit rank */}
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] text-ink-subtle font-sans">Rank:</span>
                      <input 
                        type="number" 
                        value={pri.rank}
                        onChange={(e) => handleUpdateSeverityPriority(pri.id, { rank: parseInt(e.target.value) || 0 })}
                        className="w-12 bg-surface-2 text-ink text-xs rounded border border-hairline px-1.5 py-1 text-center focus:outline-none focus:border-primary font-mono"
                      />
                    </div>

                    {/* Mapped Alert Channel Dropdown */}
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] text-ink-subtle font-sans">Route To:</span>
                      <select
                        value={pri.alert_channel_id || "none"}
                        onChange={(e) => handleUpdateSeverityPriority(pri.id, { alert_channel_id: e.target.value })}
                        className="bg-surface-2 text-ink text-[11px] rounded border border-hairline px-2 py-1 focus:outline-none focus:border-primary cursor-pointer max-w-[130px]"
                      >
                        <option value="none">All Active Channels</option>
                        {alertChannels.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.channel_type})</option>
                        ))}
                      </select>
                    </div>

                    {/* Delete Custom Priority */}
                    <div>
                      {confirmDeletePriorityId === pri.id ? (
                        <div className="flex items-center space-x-1.5 animate-in fade-in duration-200">
                          <button
                            onClick={() => {
                              handleDeleteSeverityPriority(pri.id);
                              setConfirmDeletePriorityId(null);
                            }}
                            className="text-[10px] bg-red-950/40 border border-red-900/50 hover:bg-red-900/60 text-red-400 px-2 py-0.5 rounded transition-colors font-medium"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDeletePriorityId(null)}
                            className="text-[10px] bg-surface-2 border border-hairline hover:bg-surface-3 text-ink-subtle hover:text-ink px-2 py-0.5 rounded transition-colors font-medium"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setConfirmDeletePriorityId(pri.id)}
                          className="text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/5 px-2 py-1 rounded transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderWorkflowStatusesSection = () => {
    return (
      <div className="flex flex-col bg-canvas p-6 space-y-6 border-t border-hairline mt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-hairline">
          <div>
            <h3 className="text-sm font-semibold text-ink">Custom Board Workflow Statuses</h3>
            <p className="text-xs text-ink-subtle mt-0.5 font-sans">
              Configure custom statuses to structure your issue management board columns.
            </p>
          </div>
          <button 
            onClick={() => {
              setStatusCreateError("");
              setShowCreateStatusModal(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-primary hover:bg-primary-hover active:bg-primary-focus text-xs text-ink font-semibold border border-primary-focus/50 transition-colors shadow-sm select-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Status</span>
          </button>
        </div>

        {workflowStatuses.length === 0 ? (
          <p className="text-xs text-ink-subtle italic">No custom workflow statuses configured. Falling back to default Todo / In Progress / Done columns.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {workflowStatuses.map((ws) => (
              <div key={ws.id} className="bg-surface-1 border border-hairline rounded-lg p-4 flex items-center justify-between hover:border-hairline-strong transition-colors">
                <div className="flex items-center space-x-3">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ws.color }} />
                  <div>
                    <span className="text-xs font-semibold text-ink">{ws.name}</span>
                    <span className="text-[10px] text-ink-tertiary block font-mono">Order: {ws.order_index}</span>
                  </div>
                </div>
                <button 
                  onClick={() => handleDeleteWorkflowStatus(ws.id)}
                  className="text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/5 px-2 py-1 rounded transition-colors"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCustomFieldsSection = () => {
    return (
      <div className="flex flex-col bg-canvas p-6 space-y-6 border-t border-hairline mt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-hairline">
          <div>
            <h3 className="text-sm font-semibold text-ink">Custom Field Schema Definitions</h3>
            <p className="text-xs text-ink-subtle mt-0.5 font-sans">
              Create extra data fields (text, number, date) that will show up inside your issue details panels.
            </p>
          </div>
          <button 
            onClick={() => {
              setFieldCreateError("");
              setShowCreateFieldModal(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-primary hover:bg-primary-hover active:bg-primary-focus text-xs text-ink font-semibold border border-primary-focus/50 transition-colors shadow-sm select-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Field</span>
          </button>
        </div>

        {customFields.length === 0 ? (
          <p className="text-xs text-ink-subtle italic">No custom fields defined yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {customFields.map((cf) => (
              <div key={cf.id} className="bg-surface-1 border border-hairline rounded-lg p-4 flex items-center justify-between hover:border-hairline-strong transition-colors">
                <div>
                  <span className="text-xs font-semibold text-ink">{cf.name}</span>
                  <span className="text-[10px] text-ink-tertiary block font-mono uppercase">{cf.field_type}</span>
                </div>
                <button 
                  onClick={() => handleDeleteCustomField(cf.id)}
                  className="text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/5 px-2 py-1 rounded transition-colors"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCreateStatusModal = () => {
    if (!showCreateStatusModal) return null;
    return (
      <div className="fixed inset-0 bg-semantic-overlay/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-surface-1 border border-hairline rounded-lg w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-semibold text-ink flex items-center space-x-2">
              <Layers className="w-4 h-4 text-primary" />
              <span>Add Custom Workflow Status</span>
            </h2>
            <button onClick={() => setShowCreateStatusModal(false)} className="p-1 hover:bg-surface-2 rounded text-ink-subtle hover:text-ink transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreateWorkflowStatus} className="space-y-4 font-mono text-xs">
            {statusCreateError && <div className="p-2 border border-red-500/20 text-red-400 bg-red-950/20 rounded text-[11px]">{statusCreateError}</div>}
            <div className="flex flex-col space-y-1.5">
              <label className="text-ink-subtle">Status Name</label>
              <input type="text" required placeholder="e.g. Backlog, Testing" value={newStatusName} onChange={(e) => setNewStatusName(e.target.value)} className="bg-canvas text-ink text-xs rounded border border-hairline px-3 py-2 w-full focus:outline-none focus:border-primary" />
            </div>
            <div className="flex flex-col space-y-1.5">
              <label className="text-ink-subtle">Color</label>
              <input type="text" placeholder="e.g. #ff0055, HSL(120, 50%, 50%)" value={newStatusColor} onChange={(e) => setNewStatusColor(e.target.value)} className="bg-canvas text-ink text-xs rounded border border-hairline px-3 py-2 w-full focus:outline-none focus:border-primary" />
            </div>
            <div className="flex flex-col space-y-1.5">
              <label className="text-ink-subtle">Order Index</label>
              <input type="number" value={newStatusOrderIndex} onChange={(e) => setNewStatusOrderIndex(parseInt(e.target.value) || 0)} className="bg-canvas text-ink text-xs rounded border border-hairline px-3 py-2 w-full focus:outline-none focus:border-primary" />
            </div>
            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowCreateStatusModal(false)} className="px-4 py-2 border border-hairline rounded bg-surface-2 hover:bg-surface-3 text-ink-subtle hover:text-ink transition-colors">Cancel</button>
              <button type="submit" disabled={isSavingStatus} className="px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-semibold rounded border border-primary-focus/50 transition-colors">{isSavingStatus ? "Creating..." : "Create Status"}</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderCreateFieldModal = () => {
    if (!showCreateFieldModal) return null;
    return (
      <div className="fixed inset-0 bg-semantic-overlay/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-surface-1 border border-hairline rounded-lg w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-semibold text-ink flex items-center space-x-2">
              <Settings className="w-4 h-4 text-primary" />
              <span>Add Custom Field Definition</span>
            </h2>
            <button onClick={() => setShowCreateFieldModal(false)} className="p-1 hover:bg-surface-2 rounded text-ink-subtle hover:text-ink transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreateCustomField} className="space-y-4 font-mono text-xs">
            {fieldCreateError && <div className="p-2 border border-red-500/20 text-red-400 bg-red-950/20 rounded text-[11px]">{fieldCreateError}</div>}
            <div className="flex flex-col space-y-1.5">
              <label className="text-ink-subtle">Field Name</label>
              <input type="text" required placeholder="e.g. Severity Score, Next Review" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} className="bg-canvas text-ink text-xs rounded border border-hairline px-3 py-2 w-full focus:outline-none focus:border-primary" />
            </div>
            <div className="flex flex-col space-y-1.5">
              <label className="text-ink-subtle">Field Type</label>
              <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as "text" | "number" | "date")} className="bg-canvas text-ink text-xs rounded border border-hairline px-3 py-2 w-full focus:outline-none focus:border-primary cursor-pointer">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
              </select>
            </div>
            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowCreateFieldModal(false)} className="px-4 py-2 border border-hairline rounded bg-surface-2 hover:bg-surface-3 text-ink-subtle hover:text-ink transition-colors">Cancel</button>
              <button type="submit" disabled={isSavingField} className="px-4 py-2 bg-primary hover:bg-primary-hover text-ink font-semibold rounded border border-primary-focus/50 transition-colors">{isSavingField ? "Creating..." : "Create Field"}</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderCreatePriorityModal = () => {
    if (!showCreatePriorityModal) return null;
    return (
      <div className="fixed inset-0 bg-semantic-overlay/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-surface-1 border border-hairline rounded-lg w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-semibold text-ink flex items-center space-x-2">
              <Shield className="w-4 h-4 text-primary" />
              <span>Add Severity Level</span>
            </h2>
            <button 
              onClick={() => setShowCreatePriorityModal(false)}
              className="p-1 hover:bg-surface-2 rounded text-ink-subtle hover:text-ink transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateSeverityPriority} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] text-ink-subtle font-medium uppercase tracking-wider">Severity Name</label>
              <input 
                type="text" 
                required
                value={newPriorityName}
                onChange={(e) => setNewPriorityName(e.target.value)}
                placeholder="e.g. Critical P1"
                className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-2 transition-colors duration-150"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] text-ink-subtle font-medium uppercase tracking-wider">Rank (Priority Order)</label>
                <input 
                  type="number" 
                  min="0"
                  required
                  value={newPriorityRank}
                  onChange={(e) => setNewPriorityRank(parseInt(e.target.value) || 1)}
                  className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-2 transition-colors duration-150"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] text-ink-subtle font-medium uppercase tracking-wider">Failure Count Trigger</label>
                <input 
                  type="number" 
                  min="1"
                  required
                  value={newPriorityThreshold}
                  onChange={(e) => setNewPriorityThreshold(parseInt(e.target.value) || 5)}
                  className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-2 transition-colors duration-150"
                />
              </div>
            </div>


            <div className="space-y-1.5">
              <label className="block text-[10px] text-ink-subtle font-medium uppercase tracking-wider">Route Notification Channel</label>
              <select
                value={newPriorityChannelId}
                onChange={(e) => setNewPriorityChannelId(e.target.value)}
                className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-2 transition-colors duration-150 cursor-pointer"
              >
                <option value="none">All Active Channels</option>
                {alertChannels.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.channel_type})</option>
                ))}
              </select>
            </div>

            {priorityCreateError && (
              <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/50 p-2 rounded">
                {priorityCreateError}
              </p>
            )}

            <button 
              type="submit" 
              disabled={isSavingPriority}
              className="w-full bg-primary hover:bg-primary-hover active:bg-primary-focus text-ink rounded font-medium text-xs py-2.5 px-4 border border-primary-focus/50 transition-colors duration-150"
            >
              {isSavingPriority ? "Creating..." : "Create Severity Level"}
            </button>
          </form>
        </div>
      </div>
    );
  };

  const renderCreateChannelModal = () => {
    if (!showCreateChannelModal) return null;
    return (
      <div className="fixed inset-0 bg-semantic-overlay/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-surface-1 border border-hairline rounded-lg w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-semibold text-ink flex items-center space-x-2">
              <Bell className="w-4 h-4 text-primary" />
              <span>Add Alert Channel</span>
            </h2>
            <button 
              onClick={() => setShowCreateChannelModal(false)}
              className="p-1 hover:bg-surface-2 rounded text-ink-subtle hover:text-ink transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateAlertChannel} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                Display Name
              </label>
              <input 
                type="text" 
                placeholder="e.g. Operations Slack" 
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                required
                className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-2 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                Destination Type
              </label>
              <select 
                value={newChannelType}
                onChange={(e) => setNewChannelType(e.target.value as "slack" | "discord" | "email")}
                className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-2 cursor-pointer"
              >
                <option value="slack">Slack Webhook</option>
                <option value="discord">Discord Webhook</option>
                <option value="email">Email Notification</option>
              </select>
            </div>

            {(newChannelType === "slack" || newChannelType === "discord") && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                  Webhook URL
                </label>
                <input 
                  type="url" 
                  placeholder={newChannelType === "slack" ? "https://hooks.slack.com/services/..." : "https://discord.com/api/webhooks/..."}
                  value={newChannelWebhookUrl}
                  onChange={(e) => setNewChannelWebhookUrl(e.target.value)}
                  required
                  className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-2 transition-all"
                />
              </div>
            )}

            {newChannelType === "email" && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                  Recipient Email Address
                </label>
                <input 
                  type="email" 
                  placeholder="e.g. dev-ops@company.com" 
                  value={newChannelEmail}
                  onChange={(e) => setNewChannelEmail(e.target.value)}
                  required
                  className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-2 transition-all"
                />
              </div>
            )}

            {channelCreateError && (
              <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/50 p-2.5 rounded">
                {channelCreateError}
              </p>
            )}

            <div className="flex justify-end items-center space-x-3 pt-4 border-t border-hairline">
              <button 
                type="button"
                onClick={() => setShowCreateChannelModal(false)}
                className="px-3 py-1.5 rounded bg-surface-2 border border-hairline hover:bg-surface-3 text-xs font-semibold text-ink-subtle hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={isSavingChannel}
                className="px-3 py-1.5 rounded bg-primary hover:bg-primary-hover active:bg-primary-focus text-xs font-semibold text-ink border border-primary-focus/50 transition-colors"
              >
                {isSavingChannel ? "Saving..." : "Create Channel"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderAnalyticsTab = () => {
    if (isLoadingAnalytics && !analyticsKPIs) {
      return (
        <div className="flex flex-col bg-canvas min-h-[450px] p-6 justify-center items-center">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mb-4" />
          <p className="text-ink-subtle text-sm">Loading analytics data...</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col bg-canvas min-h-[450px] p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-hairline">
          <div>
            <h3 className="text-sm font-semibold text-ink">Analytics & Metrics</h3>
            <p className="text-xs text-ink-subtle mt-0.5">
              Visualize webhook volume, delivery success rates, and average latency.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-ink-subtle font-medium uppercase tracking-wider">Time Range:</span>
            <select 
              value={analyticsDaysFilter}
              onChange={(e) => setAnalyticsDaysFilter(Number(e.target.value))}
              className="bg-surface-2 text-ink text-xs rounded border border-hairline px-2 py-1.5 focus:outline-none focus:border-primary-focus cursor-pointer"
            >
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 90 Days</option>
            </select>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-1 border border-hairline rounded-lg p-5">
            <span className="text-[11px] font-semibold text-ink-subtle uppercase tracking-wider">Total Volume</span>
            <h2 className="text-2xl font-semibold tracking-tight text-ink mt-1">
              {analyticsKPIs?.total_volume?.toLocaleString() || 0}
            </h2>
          </div>
          <div className="bg-surface-1 border border-hairline rounded-lg p-5">
            <span className="text-[11px] font-semibold text-ink-subtle uppercase tracking-wider">Success Rate</span>
            <h2 className="text-2xl font-semibold tracking-tight text-ink mt-1">
              {analyticsKPIs?.success_rate || 0}%
            </h2>
          </div>
          <div className="bg-surface-1 border border-hairline rounded-lg p-5">
            <span className="text-[11px] font-semibold text-ink-subtle uppercase tracking-wider">Avg Latency</span>
            <h2 className="text-2xl font-semibold tracking-tight text-ink mt-1">
              {analyticsKPIs?.avg_latency_ms || 0} ms
            </h2>
          </div>
        </div>

        {/* Charts */}
        <div className="bg-surface-1 border border-hairline rounded-lg p-5">
          <h4 className="text-xs font-semibold text-ink mb-4 uppercase tracking-wider">Delivery Success Over Time</h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analyticsTimeSeries}>
                <defs>
                  <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                <XAxis dataKey="date" stroke="#718096" fontSize={10} tickMargin={10} minTickGap={20} />
                <YAxis stroke="#718096" fontSize={10} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1a202c', borderColor: '#2d3748', fontSize: '12px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Area type="monotone" dataKey="success_count" name="Success" stroke="#10b981" fillOpacity={1} fill="url(#colorSuccess)" />
                <Area type="monotone" dataKey="failed_count" name="Failed" stroke="#f59e0b" fillOpacity={1} fill="url(#colorFailed)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  const getIssueTypeIcon = (type: string) => {
    const t = type?.toLowerCase();
    if (t === "bug") return <Bug className="w-3.5 h-3.5 text-red-400" />;
    if (t === "story") return <Bookmark className="w-3.5 h-3.5 text-purple-400" />;
    if (t === "task") return <CheckSquare className="w-3.5 h-3.5 text-blue-400" />;
    return <Shield className="w-3.5 h-3.5 text-amber-400" />; // default incident
  };

  const renderBoardColumn = (colStatus: string, label: string, badgeStyles: string, customColor?: string) => {
    const colIncidents = incidents.filter(i => i.status.toLowerCase() === colStatus.toLowerCase());
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
          <span 
            style={customColor ? { borderColor: `${customColor}30`, color: customColor, backgroundColor: `${customColor}10` } : {}}
            className={`text-[10px] uppercase font-semibold px-2.5 py-0.5 rounded-full border ${badgeStyles}`}
          >
            {label}
          </span>
          <span className="text-[10px] text-ink-tertiary font-mono">{colIncidents.length}</span>
        </div>
        
        <div className="flex-1 space-y-2 overflow-y-auto max-h-[450px] pr-1">
          {colIncidents.length === 0 ? (
            <div className="text-[10px] text-ink-tertiary italic text-center py-4">No issues</div>
          ) : (
            colIncidents.map(inc => {
              const ep = endpoints.find(e => e.id === inc.endpoint_id);
              const slugLabel = ep ? ep.slug : "deleted";
              
              const priStyle = getPriorityStyle(inc.priority);
              
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
                    <span 
                      style={priStyle.style}
                      className={priStyle.className}
                    >
                      {inc.priority}
                    </span>
                    <div className="flex items-center space-x-1.5">
                      {getIssueTypeIcon(inc.issue_type)}
                      <span className="text-[9px] font-mono text-ink-tertiary">/p/{slugLabel}</span>
                    </div>
                  </div>
                  <h4 className="text-xs font-semibold text-ink mt-2 line-clamp-2">{inc.title}</h4>
                  <div className="mt-3 flex items-center justify-between">
                    {inc.assignee ? (
                      <div className="flex items-center space-x-1.5 text-[9px] text-primary font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        <span>{inc.assignee}</span>
                      </div>
                    ) : (
                      <div />
                    )}
                    {inc.story_points !== null && inc.story_points !== undefined && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-surface-3 text-ink-subtle border border-hairline">
                        {inc.story_points} pts
                      </span>
                    )}
                  </div>
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
      <AuthScreen 
        onLogin={(key) => {
          localStorage.setItem("hookshield_api_key", key);
          setApiKey(key);
          fetchProfile(key);
        }} 
      />
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                      Idempotency Strategy
                    </label>
                    <select 
                      value={idempotencyStrategyInput}
                      onChange={(e) => setIdempotencyStrategyInput(e.target.value)}
                      className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150 cursor-pointer"
                    >
                      <option value="auto">Auto (Header Check)</option>
                      <option value="payload_hash">Payload Hash (Strict)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                      Idempotency TTL (hours)
                    </label>
                    <input 
                      type="number" 
                      placeholder="e.g. 24 (Default: 24)" 
                      value={idempotencyTTLInput}
                      onChange={(e) => setIdempotencyTTLInput(e.target.value)}
                      min="1"
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
                <button 
                  onClick={() => setActiveTab("roadmaps")}
                  className={`text-sm font-semibold tracking-tight transition-colors duration-150 flex items-center space-x-2 pb-0.5 ${
                    activeTab === "roadmaps" ? "text-ink border-b-2 border-primary" : "text-ink-subtle hover:text-ink"
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  <span>Roadmaps ({projects.length})</span>
                </button>
                <button 
                  onClick={() => setActiveTab("alerts")}
                  className={`text-sm font-semibold tracking-tight transition-colors duration-150 flex items-center space-x-2 pb-0.5 ${
                    activeTab === "alerts" ? "text-ink border-b-2 border-primary" : "text-ink-subtle hover:text-ink"
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </button>
                <button 
                  onClick={() => setActiveTab("analytics")}
                  className={`text-sm font-semibold tracking-tight transition-colors duration-150 flex items-center space-x-2 pb-0.5 ${
                    activeTab === "analytics" ? "text-ink border-b-2 border-primary" : "text-ink-subtle hover:text-ink"
                  }`}
                >
                  <BarChart2 className="w-4 h-4" />
                  <span>Analytics</span>
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

            {activeTab === "roadmaps" ? (
              <div className="flex flex-col bg-canvas min-h-[450px] p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-hairline">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Product Roadmaps & Initiatives</h3>
                    <p className="text-xs text-ink-subtle mt-0.5 font-sans">Organize failed webhooks into structured development efforts.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* View Toggle */}
                    <div className="flex bg-surface-2 border border-hairline rounded p-0.5 select-none w-fit">
                      <button 
                        onClick={() => setRoadmapViewMode("list")}
                        className={`px-3 py-1 text-xs rounded font-medium transition-all ${
                          roadmapViewMode === "list" 
                            ? "bg-surface-1 border border-hairline shadow-sm text-ink font-semibold" 
                            : "text-ink-subtle hover:text-ink border border-transparent"
                        }`}
                      >
                        List View
                      </button>
                      <button 
                        onClick={() => setRoadmapViewMode("timeline")}
                        className={`px-3 py-1 text-xs rounded font-medium transition-all ${
                          roadmapViewMode === "timeline" 
                            ? "bg-surface-1 border border-hairline shadow-sm text-ink font-semibold" 
                            : "text-ink-subtle hover:text-ink border border-transparent"
                        }`}
                      >
                        Timeline View
                      </button>
                    </div>
                    
                    {/* Global Buttons */}
                    {projects.length > 0 && (
                      <button 
                        onClick={() => {
                          setMilestoneProjectID(projects[0].id);
                          setShowCreateMilestoneModal(true);
                        }}
                        className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-surface-2 border border-hairline hover:bg-surface-3 text-ink text-xs font-semibold transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Milestone</span>
                      </button>
                    )}
                    
                    <button 
                      onClick={() => setShowCreateProjectModal(true)}
                      className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-primary hover:bg-primary-hover text-ink text-xs font-semibold border border-primary-focus/50 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Project</span>
                    </button>
                  </div>
                </div>

                {projects.length === 0 ? (
                  <div className="text-center py-12 text-ink-tertiary text-xs italic">
                    No roadmap initiatives created yet. Click &quot;New Project&quot; to begin tracking.
                  </div>
                ) : roadmapViewMode === "timeline" ? (
                  renderTimelineView()
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {projects.map((proj) => {
                      const projIncidents = incidents.filter(i => i.project_id === proj.id);
                      const completedCount = projIncidents.filter(i => i.status === "done").length;
                      const totalCount = projIncidents.length;
                      const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

                      let statusBadge = "border-hairline text-ink-subtle bg-surface-2";
                      if (proj.status === "backlog") statusBadge = "border-slate-500/30 text-slate-400 bg-slate-950/20";
                      if (proj.status === "started") statusBadge = "border-blue-500/30 text-blue-400 bg-blue-950/20";
                      if (proj.status === "completed") statusBadge = "border-emerald-500/30 text-emerald-400 bg-emerald-950/20";
                      if (proj.status === "paused") statusBadge = "border-amber-500/30 text-amber-400 bg-amber-950/20";

                      const projMilestones = milestones.filter(m => m.project_id === proj.id);

                      return (
                        <div key={proj.id} className="bg-surface-1 border border-hairline rounded-lg p-5 flex flex-col space-y-4 hover:border-hairline-strong transition-all duration-150 relative">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <h4 className="text-sm font-semibold text-ink">{proj.name}</h4>
                              <p className="text-xs text-ink-subtle font-sans line-clamp-2 leading-relaxed pr-2">
                                {proj.description || "No description provided."}
                              </p>
                              {proj.target_date && (
                                <p className="text-[10px] text-ink-muted">
                                  Target Completion: {new Date(proj.target_date).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            <select 
                              value={proj.status}
                              onChange={(e) => handleUpdateProject(proj.id, { status: e.target.value as "backlog" | "started" | "completed" | "paused" })}
                              className={`text-[9px] uppercase font-semibold px-2 py-0.5 rounded-full border cursor-pointer focus:outline-none ${statusBadge}`}
                            >
                              <option value="backlog">Backlog</option>
                              <option value="started">Started</option>
                              <option value="paused">Paused</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>

                          {/* Milestones list in project card */}
                          {projMilestones.length > 0 && (
                            <div className="space-y-1 pt-2 border-t border-hairline">
                              <span className="text-[9px] text-ink-muted uppercase font-bold tracking-wider">Milestones:</span>
                              <div className="flex flex-col space-y-1">
                                {projMilestones.map(m => (
                                  <div key={m.id} className="flex justify-between items-center text-[10px] bg-surface-2 p-1.5 rounded border border-hairline">
                                    <span className={`font-medium ${m.status === "completed" ? "line-through text-ink-tertiary" : "text-ink"}`}>{m.name}</span>
                                    <span className="text-ink-tertiary font-mono text-[9px]">{new Date(m.target_date).toLocaleDateString()}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Progress Indicator */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="text-ink-subtle font-medium">{progressPct}% completed</span>
                              <span className="text-ink-tertiary font-mono">{completedCount}/{totalCount} resolved</span>
                            </div>
                            <div className="w-full bg-surface-3 rounded-full h-1.5 overflow-hidden border border-hairline relative">
                              <div 
                                className="bg-gradient-to-r from-primary/80 to-primary h-full transition-all duration-500 ease-out" 
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex justify-between items-center pt-1">
                            <button 
                              onClick={() => {
                                setMilestoneProjectID(proj.id);
                                setShowCreateMilestoneModal(true);
                              }}
                              className="text-[10px] text-primary hover:underline font-semibold"
                            >
                              + Add Milestone
                            </button>
                            <button 
                              onClick={() => handleDeleteProject(proj.id)}
                              className="text-[10px] text-red-400 hover:text-red-300 font-medium hover:bg-red-500/5 px-2 py-1 rounded border border-transparent hover:border-red-950/30 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : activeTab === "board" ? (
              <div className="flex flex-col bg-canvas min-h-[450px]">
                {renderBoardFilterBar()}
                <div className={`p-4 grid grid-cols-1 gap-4`} style={{ gridTemplateColumns: `repeat(${workflowStatuses.length > 0 ? workflowStatuses.length : 3}, minmax(0, 1fr))` }}>
                  {workflowStatuses.length > 0 ? (
                    workflowStatuses.map((ws) => 
                      renderBoardColumn(
                        ws.name, 
                        ws.name, 
                        "border-hairline text-ink", 
                        ws.color
                      )
                    )
                  ) : (
                    <>
                      {renderBoardColumn("todo", "Todo", "bg-amber-500/10 border-amber-500/20 text-amber-400")}
                      {renderBoardColumn("in_progress", "In Progress", "bg-blue-500/10 border-blue-500/20 text-blue-400")}
                      {renderBoardColumn("done", "Done", "bg-emerald-500/10 border-emerald-500/20 text-success")}
                    </>
                  )}
                </div>
              </div>
            ) : activeTab === "alerts" ? (
              <div>
                {renderAlertChannelsTab()}
              </div>
            ) : activeTab === "analytics" ? (
              <div>
                {renderAnalyticsTab()}
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

              <div className="flex justify-between py-1 border-b border-hairline">
                <span className="text-ink-tertiary">Idempotency Strategy:</span>
                <span className="text-ink capitalize font-sans">{selectedEndpoint.idempotency_strategy || "auto"}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-hairline">
                <span className="text-ink-tertiary">Idempotency TTL:</span>
                <span className="text-ink font-sans">
                  {selectedEndpoint.idempotency_ttl ? (selectedEndpoint.idempotency_ttl / 3600).toFixed(1) : "24"} hours
                </span>
              </div>
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
                  <span className="text-ink-subtle">Issue Type:</span>
                  <select 
                    value={selectedIncident.issue_type || "incident"}
                    onChange={(e) => handleUpdateIncident(selectedIncident.id, { issue_type: e.target.value as "incident" | "story" | "task" | "bug" })}
                    className="bg-canvas text-ink text-xs rounded border border-hairline px-2 py-1 focus:outline-none focus:border-primary capitalize font-sans"
                  >
                    <option value="incident">Incident</option>
                    <option value="story">Story</option>
                    <option value="task">Task</option>
                    <option value="bug">Bug</option>
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-ink-subtle">Status:</span>
                  <select 
                    value={selectedIncident.status}
                    onChange={(e) => handleUpdateIncident(selectedIncident.id, { status: e.target.value })}
                    className="bg-canvas text-ink text-xs rounded border border-hairline px-2 py-1 focus:outline-none focus:border-primary capitalize font-sans"
                  >
                    {workflowStatuses.length > 0 ? (
                      workflowStatuses.map(ws => (
                        <option key={ws.id} value={ws.name}>{ws.name}</option>
                      ))
                    ) : (
                      <>
                        <option value="todo">Todo</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done (Resolved)</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-ink-subtle">Priority:</span>
                  <select 
                    value={selectedIncident.priority}
                    onChange={(e) => handleUpdateIncident(selectedIncident.id, { priority: e.target.value })}
                    className="bg-canvas text-ink text-xs rounded border border-hairline px-2 py-1 focus:outline-none focus:border-primary uppercase font-sans"
                  >
                    {severityPriorities.length > 0 ? (
                      severityPriorities.map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))
                    ) : (
                      <>
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-ink-subtle">Story Points:</span>
                  <input 
                    type="number" 
                    min="0"
                    placeholder="0" 
                    value={selectedIncident.story_points ?? ""}
                    onChange={(e) => {
                      const val = e.target.value === "" ? null : parseInt(e.target.value);
                      setSelectedIncident(prev => prev ? { ...prev, story_points: val } : null);
                    }}
                    onBlur={(e) => {
                      const val = e.target.value === "" ? null : parseInt(e.target.value);
                      handleUpdateIncident(selectedIncident.id, { story_points: val });
                    }}
                    className="bg-canvas text-ink text-xs rounded border border-hairline px-2 py-1 w-20 focus:outline-none focus:border-primary text-center"
                  />
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
                      className="bg-canvas text-ink text-xs rounded border border-hairline px-2 py-1 w-32 focus:outline-none focus:border-primary font-sans"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-ink-subtle">Project Initiative:</span>
                  <select 
                    value={selectedIncident.project_id || ""}
                    onChange={(e) => handleUpdateIncident(selectedIncident.id, { project_id: e.target.value || null })}
                    className="bg-canvas text-ink text-xs rounded border border-hairline px-2 py-1 w-48 focus:outline-none focus:border-primary cursor-pointer font-sans"
                  >
                    <option value="">No Project Initiative</option>
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id}>{proj.name}</option>
                    ))}
                  </select>
                </div>

                {/* Custom Fields dynamic render */}
                {customFields.map((cf) => {
                  const currentVal = selectedIncident.custom_values?.find(cv => cv.field_id === cf.id)?.value_text || "";
                  return (
                    <div key={cf.id} className="flex justify-between items-center">
                      <span className="text-ink-subtle">{cf.name}:</span>
                      <input 
                        type={cf.field_type === "number" ? "number" : cf.field_type === "date" ? "date" : "text"}
                        value={currentVal}
                        placeholder={`Enter ${cf.name.toLowerCase()}`}
                        onChange={(e) => {
                          const newVal = e.target.value;
                          setSelectedIncident(prev => {
                            if (!prev) return null;
                            const updatedValues = [...(prev.custom_values || [])];
                            const idx = updatedValues.findIndex(cv => cv.field_id === cf.id);
                            if (idx >= 0) {
                              updatedValues[idx] = { ...updatedValues[idx], value_text: newVal };
                            } else {
                              updatedValues.push({ id: "", issue_id: prev.id, field_id: cf.id, value_text: newVal, created_at: "" });
                            }
                            return { ...prev, custom_values: updatedValues };
                          });
                        }}
                        onBlur={(e) => handleSaveCustomFieldValue(selectedIncident.id, cf.id, e.target.value)}
                        className="bg-canvas text-ink text-xs rounded border border-hairline px-2 py-1 w-32 focus:outline-none focus:border-primary font-sans"
                      />
                    </div>
                  );
                })}
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
                { label: "Switch to Roadmap Initiatives", shortcut: "R", action: () => setActiveTab("roadmaps") },
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

              {/* Dynamic Project Search Results */}
              {projects.length > 0 && (
                <>
                  <div className="text-[10px] text-ink-tertiary px-2 py-1 uppercase font-semibold mt-2">Projects</div>
                  {projects.filter(p => p.name.toLowerCase().includes(commandQuery.toLowerCase()) || (p.description && p.description.toLowerCase().includes(commandQuery.toLowerCase()))).map((proj) => (
                    <div 
                      key={proj.id}
                      onClick={() => { setActiveTab("roadmaps"); setShowCommandMenu(false); setCommandQuery(""); }}
                      className="flex justify-between items-center px-2 py-1.5 rounded hover:bg-primary/10 text-xs text-ink cursor-pointer hover:text-primary transition-colors"
                    >
                      <span className="truncate">{proj.name}</span>
                      <span className="text-[10px] uppercase font-mono text-ink-tertiary">{proj.status}</span>
                    </div>
                  ))}
                </>
              )}

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
                  <div className="flex justify-between items-center">
                    <span className="text-ink-subtle">Switch to Roadmaps</span>
                    <kbd className="text-[10px] bg-surface-3 border border-hairline text-ink-tertiary px-1.5 py-0.5 rounded font-mono uppercase">R</kbd>
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

      {/* 7. Create Project Modal */}
      {showCreateProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowCreateProjectModal(false)}
          />
          
          {/* Modal Card */}
          <div className="bg-surface-1 border border-hairline w-full max-w-md rounded-lg shadow-2xl overflow-hidden relative z-10 flex flex-col p-6 space-y-4 font-sans">
            <div className="flex justify-between items-center pb-2 border-b border-hairline">
              <span className="font-semibold text-sm text-ink">Create New Roadmap Initiative</span>
              <button 
                onClick={() => setShowCreateProjectModal(false)}
                className="text-ink-subtle hover:text-ink transition-colors duration-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                  Project Name
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. Auth Consolidation, Stripe SDK Upgrade" 
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea 
                  placeholder="Summarize the core milestones and objective..." 
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                  Target Completion Date (Optional)
                </label>
                <input 
                  type="date" 
                  value={projectTargetDate}
                  onChange={(e) => setProjectTargetDate(e.target.value)}
                  className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                  Status
                </label>
                <select 
                  value={projectStatusInput}
                  onChange={(e) => setProjectStatusInput(e.target.value as "backlog" | "started" | "completed" | "paused")}
                  className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                >
                  <option value="backlog">Backlog</option>
                  <option value="started">Started</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {projectCreateError && (
                <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/50 p-2 rounded">
                  {projectCreateError}
                </p>
              )}

              <button 
                type="submit" 
                disabled={isCreatingProject}
                className="w-full bg-primary hover:bg-primary-hover active:bg-primary-focus text-ink rounded font-medium text-xs py-2 px-4 border border-primary-focus/50 transition-colors duration-150"
              >
                {isCreatingProject ? "Creating..." : "Create Project"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 8. Create Milestone Modal */}
      {showCreateMilestoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowCreateMilestoneModal(false)}
          />
          
          {/* Modal Card */}
          <div className="bg-surface-1 border border-hairline w-full max-w-md rounded-lg shadow-2xl overflow-hidden relative z-10 flex flex-col p-6 space-y-4 font-sans">
            <div className="flex justify-between items-center pb-2 border-b border-hairline">
              <span className="font-semibold text-sm text-ink">Create New Milestone</span>
              <button 
                onClick={() => setShowCreateMilestoneModal(false)}
                className="text-ink-subtle hover:text-ink transition-colors duration-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleCreateMilestone} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                  Project Initiative
                </label>
                <select 
                  value={milestoneProjectID}
                  onChange={(e) => setMilestoneProjectID(e.target.value)}
                  className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                  required
                >
                  <option value="">Select Project Initiative...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                  Milestone Name
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. Beta Launch, SDK Core Stable" 
                  value={milestoneName}
                  onChange={(e) => setMilestoneName(e.target.value)}
                  className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea 
                  placeholder="Summarize what this milestone represents..." 
                  value={milestoneDescription}
                  onChange={(e) => setMilestoneDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                  Target Date
                </label>
                <input 
                  type="date" 
                  value={milestoneTargetDate}
                  onChange={(e) => setMilestoneTargetDate(e.target.value)}
                  className="w-full bg-surface-2 text-ink text-sm rounded border border-hairline focus:border-hairline-strong focus:outline-none px-3 py-1.5 transition-colors duration-150"
                  required
                />
              </div>

              {milestoneCreateError && (
                <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/50 p-2 rounded">
                  {milestoneCreateError}
                </p>
              )}

              <button 
                type="submit" 
                disabled={isCreatingMilestone}
                className="w-full bg-primary hover:bg-primary-hover active:bg-primary-focus text-ink rounded font-medium text-xs py-2 px-4 border border-primary-focus/50 transition-colors duration-150"
              >
                {isCreatingMilestone ? "Creating..." : "Create Milestone"}
              </button>
            </form>
          </div>
        </div>
      )}

      {renderCreateChannelModal()}
      {renderCreatePriorityModal()}
      {renderCreateStatusModal()}
      {renderCreateFieldModal()}

    </div>
  );
}

