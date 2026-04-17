import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Save,
  AlertCircle,
  Check,
  RefreshCw,
  Settings2,
  Layout,
  SlidersHorizontal,
  Network,
  Package,
  Shield,
  Terminal,
  Command,
  Palette,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Bot,
  FileText,
  FolderSearch,
} from "lucide-react";
import { BreathingDots } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  api,
  type ClaudeSettings,
  type ClaudeInstallation,
  type SkillInfo,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { ClaudeVersionSelector } from "./ClaudeVersionSelector";
import { SlashCommandsManager } from "./SlashCommandsManager";
import { ProxySettings } from "./ProxySettings";
import { Agents } from "./Agents";
import { MarkdownEditor } from "./MarkdownEditor";
import { ClaudeExplorer } from "./ClaudeExplorer";
import { useTheme } from "@/hooks";
import { useDebugMode } from "@/hooks/useDebugMode";
import { TabPersistenceService } from "@/services/tabPersistence";
import { ccodeSettings } from "@/lib/ccodeSettings";

interface SettingsProps {
  /**
   * Callback to go back to the main view
   */
  onBack: () => void;
  /**
   * Optional className for styling
   */
  className?: string;
}

interface PermissionRule {
  id: string;
  value: string;
}

interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
}

const CCODE_NAV_ITEMS = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'interface', label: 'Interface', icon: Layout },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'environment', label: 'Environment', icon: Terminal },
  { id: 'proxy', label: 'Proxy', icon: Network },
  { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
] as const;

const CLAUDE_NAV_ITEMS = [
  { id: 'commands', label: 'Commands', icon: Command },
  { id: 'skills', label: 'Skills', icon: Package },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'claude-md', label: 'CLAUDE.md', icon: FileText },
  { id: 'claude-explorer', label: '.claude Explorer', icon: FolderSearch },
] as const;

type SectionId = typeof CCODE_NAV_ITEMS[number]['id'] | typeof CLAUDE_NAV_ITEMS[number]['id'];

// ─── Color picker helpers ─────────────────────────────────────────────────────

function toHexColor(color: string): string {
  const rgba = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgba) {
    return '#' + [rgba[1], rgba[2], rgba[3]]
      .map(n => parseInt(n).toString(16).padStart(2, '0'))
      .join('');
  }
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color.slice(0, 7).padEnd(7, '0');
  return '#808080';
}

function applyHexPreservingAlpha(current: string, hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const alphaMatch = current.match(/rgba?\([^)]+,\s*([\d.]+)\)/);
  if (alphaMatch) return `rgba(${r}, ${g}, ${b}, ${alphaMatch[1]})`;
  return hex;
}

interface ColorFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const ColorField: React.FC<ColorFieldProps> = ({ id, label, value, onChange, placeholder }) => (
  <div className="space-y-2">
    <Label htmlFor={id} className="text-caption">{label}</Label>
    <div className="flex gap-2">
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-xs flex-1"
      />
      <div className="relative w-10 h-10 rounded border flex-shrink-0 overflow-hidden cursor-pointer">
        <div className="absolute inset-0" style={{ backgroundColor: value }} />
        <input
          type="color"
          value={toHexColor(value)}
          onChange={(e) => onChange(applyHexPreservingAlpha(value, e.target.value))}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          title={value}
        />
      </div>
    </div>
  </div>
);

const ChatPreview: React.FC = () => (
  <div className="rounded-lg border border-border/40 overflow-hidden text-xs">
    <div className="px-3 py-1.5 border-b border-border/40 text-muted-foreground/60 font-medium">Preview</div>
    <div className="p-4 space-y-3 bg-background">
      {/* User message */}
      <div className="flex justify-end items-end gap-2">
        <div className="px-3 py-2 rounded-xl rounded-br-sm border max-w-[70%]"
          style={{ borderColor: 'var(--chat-user-border)', backgroundColor: 'var(--chat-user-bg)' }}>
          How do I fix this bug in my code?
        </div>
        <div className="h-5 w-5 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 text-[9px] text-muted-foreground">U</div>
      </div>

      {/* Work block */}
      <div className="pl-3 border-l-2 space-y-1.5 ml-2" style={{ borderColor: 'var(--chat-work-border)' }}>
        <div className="text-muted-foreground/50">2 steps</div>
        <div className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--chat-agent-border)', backgroundColor: 'var(--chat-agent-bg)' }}>
          <span className="text-muted-foreground/60">Reading file: </span><span className="font-mono">main.ts</span>
        </div>
        <div className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--chat-agent-border)', backgroundColor: 'var(--chat-agent-bg)' }}>
          <span className="font-mono text-green-400">$ </span><span className="font-mono">npm test</span>
        </div>
      </div>

      {/* Final response */}
      <div className="rounded-lg border p-3 space-y-1" style={{ borderColor: 'var(--chat-final-border)', backgroundColor: 'var(--chat-final-bg)' }}>
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-4 rounded-full flex items-center justify-center text-[9px]" style={{ backgroundColor: 'var(--chat-final-border)' }}>A</div>
          <span className="font-medium">Answer</span>
        </div>
        <div className="text-muted-foreground">The issue is on line 42 — you're calling <code className="font-mono bg-muted px-1 rounded">map()</code> on a nullable value.</div>
      </div>

      {/* Result ok */}
      <div className="rounded border px-2 py-1.5 flex items-center gap-1.5" style={{ borderColor: 'var(--chat-result-ok-border)', backgroundColor: 'var(--chat-result-ok-bg)' }}>
        <span className="text-green-400">✓</span> Session complete · 3 steps
      </div>

      {/* Result error */}
      <div className="rounded border px-2 py-1.5 flex items-center gap-1.5" style={{ borderColor: 'var(--chat-result-err-border)', backgroundColor: 'var(--chat-result-err-bg)' }}>
        <span className="text-red-400">✗</span> Error: command failed with exit code 1
      </div>
    </div>
  </div>
);

/**
 * Comprehensive Settings UI for managing Claude Code settings
 * Provides a no-code interface for editing the settings.json file
 */
export const Settings: React.FC<SettingsProps> = ({
  className,
}) => {
  const [settings, setSettings] = useState<ClaudeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [currentBinaryPath, setCurrentBinaryPath] = useState<string | null>(null);
  const [selectedInstallation, setSelectedInstallation] = useState<ClaudeInstallation | null>(null);
  const [binaryPathChanged, setBinaryPathChanged] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Permission rules state
  const [allowRules, setAllowRules] = useState<PermissionRule[]>([]);
  const [denyRules, setDenyRules] = useState<PermissionRule[]>([]);
  
  // Environment variables state
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([]);
  
  // Hooks state
  const [userHooksChanged, setUserHooksChanged] = useState(false);
  const getUserHooks = React.useRef<(() => any) | null>(null);
  
  // Theme hook
  const { theme, setTheme, customColors, setCustomColors } = useTheme();

  // Debug mode hook
  const { debugMode, setDebugMode } = useDebugMode();

  // Proxy state
  const [proxySettingsChanged, setProxySettingsChanged] = useState(false);
  const saveProxySettings = React.useRef<(() => Promise<void>) | null>(null);
  
  // Tab persistence state
  const [tabPersistenceEnabled, setTabPersistenceEnabled] = useState(true);
  // Startup intro preference
  const [startupIntroEnabled, setStartupIntroEnabled] = useState(true);

  // Skills section state
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<Record<string, string>>({});



  // Collapsible custom color sections
  const [colorSectionOpen, setColorSectionOpen] = useState<Record<string, boolean>>({
    surface: true,
    text: true,
    interactive: true,
    chat: true,
  });

  const [sidebarDefaultOpen, setSidebarDefaultOpen] = useState(false);
  const [statusBarVisible, setStatusBarVisible] = useState(true);
  const [workBlockAutoExpand, setWorkBlockAutoExpand] = useState(false);
  const [showStreamingIndicator, setShowStreamingIndicator] = useState(true);
  const [showSystemFooter, setShowSystemFooter] = useState(false);

  const [fontSans, setFontSans] = useState('');
  const [fontMono, setFontMono] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [systemFonts, setSystemFonts] = useState<Array<{ name: string; is_monospace: boolean }>>([]);
  const [fontsLoading, setFontsLoading] = useState(false);


  // Auth status state
  const [authStatus, setAuthStatus] = useState<{
    loggedIn: boolean;
    email: string | null;
    orgName: string | null;
    subscriptionType: string | null;
    authMethod: string | null;
  } | null>(null);

  const [autoModeConfig, setAutoModeConfig] = useState<unknown>(null);
  const [autoModeLoading, setAutoModeLoading] = useState(false);
  const [autoModeError, setAutoModeError] = useState<string | null>(null);

  const [doctorOutput, setDoctorOutput] = useState<string | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [doctorError, setDoctorError] = useState<string | null>(null);

  useEffect(() => {
    setSidebarDefaultOpen(localStorage.getItem('ui_pref:sidebar_default_open') === 'true');
    setStatusBarVisible(localStorage.getItem('ui_pref:status_bar_visible') !== 'false');
    setWorkBlockAutoExpand(localStorage.getItem('ui_pref:work_block_auto_expand') === 'true');
    setShowStreamingIndicator(localStorage.getItem('ui_pref:show_streaming_indicator') !== 'false');
  }, []);

  useEffect(() => {
    localStorage.setItem('ui_pref:sidebar_default_open', sidebarDefaultOpen.toString());
  }, [sidebarDefaultOpen]);

  useEffect(() => {
    localStorage.setItem('ui_pref:status_bar_visible', statusBarVisible.toString());
  }, [statusBarVisible]);

  useEffect(() => {
    localStorage.setItem('ui_pref:work_block_auto_expand', workBlockAutoExpand.toString());
  }, [workBlockAutoExpand]);

  useEffect(() => {
    localStorage.setItem('ui_pref:show_streaming_indicator', showStreamingIndicator.toString());
  }, [showStreamingIndicator]);


  // Load settings on mount
  useEffect(() => {
    loadSettings();
    loadClaudeBinaryPath();
    setTabPersistenceEnabled(TabPersistenceService.isEnabled());
    (async () => {
      const startupIntroPref = await ccodeSettings.getPreference('startup_intro_enabled');
      setStartupIntroEnabled(startupIntroPref === null || startupIntroPref === undefined ? true : Boolean(startupIntroPref));

      // Load auth status
      const auth = await api.getAuthStatus().catch(() => null);
      setAuthStatus(auth);

      // Load font preferences from ccodeSettings
      const savedFontSans = await ccodeSettings.getPreference('font_sans');
      const savedFontMono = await ccodeSettings.getPreference('font_mono');
      const savedFontSize = await ccodeSettings.getPreference('font_size');
      const savedShowSystemFooter = await ccodeSettings.getPreference('show_system_footer');
      setFontSans(savedFontSans || '');
      setFontMono(savedFontMono || '');
      setFontSize(savedFontSize || 14);
      if (savedShowSystemFooter !== null && savedShowSystemFooter !== undefined) {
        setShowSystemFooter(Boolean(savedShowSystemFooter));
      }

      // Apply immediately
      if (savedFontSans) document.documentElement.style.setProperty('--font-sans', savedFontSans);
      if (savedFontMono) document.documentElement.style.setProperty('--font-mono', savedFontMono);
      document.documentElement.style.setProperty('font-size', `${savedFontSize || 14}px`);
    })();
  }, []);

  /**
   * Loads the current Claude binary path
   */
  const loadClaudeBinaryPath = async () => {
    try {
      const path = await api.getClaudeBinaryPath();
      setCurrentBinaryPath(path);
    } catch (err) {
      console.error("Failed to load Claude binary path:", err);
    }
  };

  // Load system fonts when theme section is activated (lazy loading)
  useEffect(() => {
    if (activeSection !== 'theme' || systemFonts.length > 0) return;
    setFontsLoading(true);
    api.listSystemFonts()
      .then(fonts => setSystemFonts(fonts))
      .catch(() => {})
      .finally(() => setFontsLoading(false));
  }, [activeSection, systemFonts.length]);

  useEffect(() => {
    if (activeSection === 'skills') {
      loadSkills();
    }
  }, [activeSection]);

  const handleFontSansChange = async (value: string) => {
    setFontSans(value);
    if (value) {
      document.documentElement.style.setProperty('--font-sans', value);
    } else {
      document.documentElement.style.removeProperty('--font-sans');
    }
    await ccodeSettings.setPreference('font_sans', value);
  };

  const handleFontMonoChange = async (value: string) => {
    setFontMono(value);
    if (value) {
      document.documentElement.style.setProperty('--font-mono', value);
    } else {
      document.documentElement.style.removeProperty('--font-mono');
    }
    await ccodeSettings.setPreference('font_mono', value);
  };

  const handleFontSizeChange = async (value: number) => {
    setFontSize(value);
    document.documentElement.style.setProperty('font-size', `${value}px`);
    await ccodeSettings.setPreference('font_size', value);
  };

  /**
   * Loads installed skills
   */
  const loadSkills = async () => {
    try {
      setSkillsLoading(true);
      const skillList = await api.listSkills();
      setSkills(skillList);
    } catch (err) {
      console.error("Failed to load skills:", err);
      setSkills([]);
    } finally {
      setSkillsLoading(false);
    }
  };


  /**
   * Loads commands.conf content
   */
  /**
   * Loads the current Claude settings
   */
  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedSettings = await api.getClaudeSettings();
      
      // Ensure loadedSettings is an object
      if (!loadedSettings || typeof loadedSettings !== 'object') {
        console.warn("Loaded settings is not an object:", loadedSettings);
        setSettings({});
        return;
      }
      
      setSettings(loadedSettings);

      // Parse permissions
      if (loadedSettings.permissions && typeof loadedSettings.permissions === 'object') {
        if (Array.isArray(loadedSettings.permissions.allow)) {
          setAllowRules(
            loadedSettings.permissions.allow.map((rule: string, index: number) => ({
              id: `allow-${index}`,
              value: rule,
            }))
          );
        }
        if (Array.isArray(loadedSettings.permissions.deny)) {
          setDenyRules(
            loadedSettings.permissions.deny.map((rule: string, index: number) => ({
              id: `deny-${index}`,
              value: rule,
            }))
          );
        }
      }

      // Parse environment variables
      if (loadedSettings.env && typeof loadedSettings.env === 'object' && !Array.isArray(loadedSettings.env)) {
        setEnvVars(
          Object.entries(loadedSettings.env).map(([key, value], index) => ({
            id: `env-${index}`,
            key,
            value: value as string,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      setError("Failed to load settings. Please ensure ~/.claude directory exists.");
      setSettings({});
    } finally {
      setLoading(false);
    }
  };

  /**
   * Saves the current settings
   */
  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    setToast(null);
    const errors: string[] = [];

    // 1. Save main claude settings
    try {
      const updatedSettings: ClaudeSettings = {
        ...(settings ?? {}),
        permissions: {
          allow: allowRules.map(rule => rule.value).filter(v => v && String(v).trim()),
          deny: denyRules.map(rule => rule.value).filter(v => v && String(v).trim()),
        },
        env: envVars.reduce((acc, { key, value }) => {
          if (key && String(key).trim() && value && String(value).trim()) {
            acc[key] = String(value);
          }
          return acc;
        }, {} as Record<string, string>),
      };
      await api.saveClaudeSettings(updatedSettings as any);
      setSettings(updatedSettings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to save Claude settings:", msg);
      errors.push(`Settings: ${msg}`);
    }

    // 2. Save binary path only when user explicitly changed it to a different value
    if (binaryPathChanged && selectedInstallation?.path && selectedInstallation.path !== currentBinaryPath) {
      try {
        await api.setClaudeBinaryPath(selectedInstallation.path);
        setCurrentBinaryPath(selectedInstallation.path);
        setBinaryPathChanged(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Failed to save binary path:", msg);
        errors.push(`Binary path: ${msg}`);
      }
    }

    // 3. Save hooks if changed
    if (userHooksChanged && getUserHooks.current) {
      try {
        const hooks = getUserHooks.current();
        await api.updateHooksConfig('user', hooks);
        setUserHooksChanged(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Failed to save hooks:", msg);
        errors.push(`Hooks: ${msg}`);
      }
    }

    // 4. Save proxy settings if changed
    if (proxySettingsChanged && saveProxySettings.current) {
      try {
        await saveProxySettings.current();
        setProxySettingsChanged(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Failed to save proxy settings:", msg);
        errors.push(`Proxy: ${msg}`);
      }
    }

    setSaving(false);

    if (errors.length > 0) {
      const detail = errors.join(' | ');
      setError(detail);
      setToast({ message: detail, type: "error" });
    } else {
      setToast({ message: "Settings saved successfully!", type: "success" });
    }
  };

  /**
   * Updates a simple setting value
   */
  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  /**
   * Adds a new permission rule
   */
  const addPermissionRule = (type: "allow" | "deny") => {
    const newRule: PermissionRule = {
      id: `${type}-${Date.now()}`,
      value: "",
    };
    
    if (type === "allow") {
      setAllowRules(prev => [...prev, newRule]);
    } else {
      setDenyRules(prev => [...prev, newRule]);
    }
  };

  /**
   * Updates a permission rule
   */
  const updatePermissionRule = (type: "allow" | "deny", id: string, value: string) => {
    if (type === "allow") {
      setAllowRules(prev => prev.map(rule => 
        rule.id === id ? { ...rule, value } : rule
      ));
    } else {
      setDenyRules(prev => prev.map(rule => 
        rule.id === id ? { ...rule, value } : rule
      ));
    }
  };

  /**
   * Removes a permission rule
   */
  const removePermissionRule = (type: "allow" | "deny", id: string) => {
    if (type === "allow") {
      setAllowRules(prev => prev.filter(rule => rule.id !== id));
    } else {
      setDenyRules(prev => prev.filter(rule => rule.id !== id));
    }
  };

  /**
   * Adds a new environment variable
   */
  const addEnvVar = () => {
    const newVar: EnvironmentVariable = {
      id: `env-${Date.now()}`,
      key: "",
      value: "",
    };
    setEnvVars(prev => [...prev, newVar]);
  };

  /**
   * Updates an environment variable
   */
  const updateEnvVar = (id: string, field: "key" | "value", value: string) => {
    setEnvVars(prev => prev.map(envVar => 
      envVar.id === id ? { ...envVar, [field]: value } : envVar
    ));
  };

  /**
   * Removes an environment variable
   */
  const removeEnvVar = (id: string) => {
    setEnvVars(prev => prev.filter(envVar => envVar.id !== id));
  };

  /**
   * Handle Claude installation selection
   */
  const handleClaudeInstallationSelect = (installation: ClaudeInstallation) => {
    setSelectedInstallation(installation);
    setBinaryPathChanged(installation.path !== currentBinaryPath);
  };

  return (
    <div className={cn("h-full overflow-hidden", className)}>
      <div className="h-full flex flex-row">
        {/* Left Panel - Navigation Sidebar */}
        <div className="w-48 flex-shrink-0 border-r border-border/50 flex flex-col overflow-hidden bg-muted/20">
          <div className="p-4 border-b border-border/50 flex-shrink-0">
            <h2 className="text-base font-semibold">Settings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Configure Claude Code</p>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest select-none">
              C-Code
            </p>
            {CCODE_NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors",
                  activeSection === item.id
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <item.icon size={14} className="flex-shrink-0" />
                {item.label}
              </button>
            ))}

            <p className="px-4 pt-4 pb-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest select-none">
              .claude
            </p>
            {CLAUDE_NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors",
                  activeSection === item.id
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <item.icon size={14} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                <span className="text-[9px] font-mono text-muted-foreground/50 bg-muted/50 px-1 rounded leading-tight flex-shrink-0">
                  ~/.claude
                </span>
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-border/50 flex-shrink-0">
            <Button onClick={saveSettings} disabled={saving} className="w-full" size="sm">
              {saving ? <BreathingDots className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
              Save
            </Button>
          </div>
        </div>

        {/* Right Panel - Content Area */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/50 flex items-center gap-2 text-body-small text-destructive"
              >
                <AlertCircle className="h-4 w-4" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <BreathingDots className="h-8 w-8 text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Toast inline notification */}
              {toast && (
                <div className={cn("mb-4 p-3 rounded-md text-sm border",
                  toast.type === 'error'
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : "bg-green-500/10 text-green-600 border-green-500/30"
                )}>
                  {toast.message}
                </div>
              )}
            
              {activeSection === 'general' && (
              <div className="space-y-6">
              {/* Auth status card */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Claude Account</p>
                    {authStatus?.loggedIn ? (
                      <div className="space-y-0.5">
                        {authStatus.email && (
                          <p className="text-xs text-muted-foreground">{authStatus.email}</p>
                        )}
                        {authStatus.orgName && (
                          <p className="text-xs text-muted-foreground">{authStatus.orgName}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Not logged in</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {authStatus && (
                      <div className={cn(
                        'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
                        authStatus.loggedIn
                          ? 'bg-green-500/20 text-green-600'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        <div className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          authStatus.loggedIn ? 'bg-green-500' : 'bg-muted-foreground'
                        )} />
                        {authStatus.loggedIn
                          ? (authStatus.subscriptionType ?? 'logged in')
                          : 'logged out'}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
              <Card className="p-6 space-y-6">
                <div>
                  <h3 className="text-heading-4 mb-4">C-Code Settings</h3>
                  <p className="text-caption text-muted-foreground mb-4">
                    Configure app-level preferences
                  </p>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="sidebar-default-open-gen" className="text-label">
                          Sidebar visible by default
                        </Label>
                      </div>
                      <Switch
                        id="sidebar-default-open-gen"
                        checked={sidebarDefaultOpen}
                        onCheckedChange={setSidebarDefaultOpen}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="status-bar-visible-gen" className="text-label">
                          Show session status bar
                        </Label>
                      </div>
                      <Switch
                        id="status-bar-visible-gen"
                        checked={statusBarVisible}
                        onCheckedChange={setStatusBarVisible}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="work-block-auto-expand-gen" className="text-label">
                          Auto-expand work blocks
                        </Label>
                      </div>
                      <Switch
                        id="work-block-auto-expand-gen"
                        checked={workBlockAutoExpand}
                        onCheckedChange={setWorkBlockAutoExpand}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="show-streaming-indicator-gen" className="text-label">
                          Show streaming indicator
                        </Label>
                      </div>
                      <Switch
                        id="show-streaming-indicator-gen"
                        checked={showStreamingIndicator}
                        onCheckedChange={setShowStreamingIndicator}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="show-system-footer-gen" className="text-label">
                          System Resources Footer
                        </Label>
                        <p className="text-caption text-muted-foreground">
                          Show RAM, CPU, and disk usage in a footer bar
                        </p>
                      </div>
                      <Switch
                        id="show-system-footer-gen"
                        checked={showSystemFooter}
                        onCheckedChange={async (checked) => {
                          setShowSystemFooter(checked);
                          window.dispatchEvent(new CustomEvent('ccode:show-system-footer', { detail: checked }));
                          try {
                            await ccodeSettings.setPreference('show_system_footer', checked);
                            setToast({ message: checked ? 'System footer enabled' : 'System footer disabled', type: 'success' });
                          } catch {
                            setToast({ message: 'Failed to save preference', type: 'error' });
                          }
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="tab-persistence">Remember Open Tabs</Label>
                        <p className="text-caption text-muted-foreground">
                          Restore your tabs when you restart the app
                        </p>
                      </div>
                      <Switch
                        id="tab-persistence"
                        checked={tabPersistenceEnabled}
                        onCheckedChange={(checked) => {
                          TabPersistenceService.setEnabled(checked);
                          setTabPersistenceEnabled(checked);
                          setToast({
                            message: checked
                              ? "Tab persistence enabled - your tabs will be restored on restart"
                              : "Tab persistence disabled - tabs will not be saved",
                            type: "success"
                          });
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="startup-intro">Show Welcome Intro on Startup</Label>
                        <p className="text-caption text-muted-foreground">
                          Display a brief welcome animation when the app launches
                        </p>
                      </div>
                      <Switch
                        id="startup-intro"
                        checked={startupIntroEnabled}
                        onCheckedChange={async (checked) => {
                          setStartupIntroEnabled(checked);
                          try {
                            await ccodeSettings.setPreference('startup_intro_enabled', checked);
                            setToast({
                              message: checked
                                ? 'Welcome intro enabled'
                                : 'Welcome intro disabled',
                              type: 'success'
                            });
                          } catch (e) {
                            setToast({ message: 'Failed to update preference', type: 'error' });
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 space-y-6">
                <div>
                  <h3 className="text-heading-4 mb-4">Claude Code Settings</h3>
                  <p className="text-caption text-muted-foreground mb-4">
                    Configure Claude Code behavior and binary path
                  </p>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 flex-1">
                        <Label htmlFor="coauthored">Include "Co-authored by Claude"</Label>
                        <p className="text-caption text-muted-foreground">
                          Add Claude attribution to git commits and pull requests
                        </p>
                      </div>
                      <Switch
                        id="coauthored"
                        checked={settings?.includeCoAuthoredBy !== false}
                        onCheckedChange={(checked) => updateSetting("includeCoAuthoredBy", checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 flex-1">
                        <Label htmlFor="verbose">Verbose Output</Label>
                        <p className="text-caption text-muted-foreground">
                          Show full bash and command outputs
                        </p>
                      </div>
                      <Switch
                        id="verbose"
                        checked={settings?.verbose === true}
                        onCheckedChange={(checked) => updateSetting("verbose", checked)}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <Label htmlFor="cleanup">Chat Transcript Retention (days)</Label>
                          <p className="text-caption text-muted-foreground mt-1">
                            How long to retain chat transcripts locally (default: 30 days)
                          </p>
                        </div>
                        <Input
                          id="cleanup"
                          type="number"
                          min="1"
                          placeholder="30"
                          value={settings?.cleanupPeriodDays || ""}
                          onChange={(e) => {
                            const value = e.target.value ? parseInt(e.target.value) : undefined;
                            updateSetting("cleanupPeriodDays", value);
                          }}
                          className="w-24"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <ClaudeVersionSelector
                        selectedPath={currentBinaryPath}
                        onSelect={handleClaudeInstallationSelect}
                        simplified={true}
                      />
                      {binaryPathChanged && (
                        <p className="text-caption text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Changes will be applied when you save settings.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Health Check</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Run <code className="font-mono">claude doctor</code> to check your installation
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={doctorLoading}
                    onClick={async () => {
                      setDoctorLoading(true);
                      setDoctorError(null);
                      try {
                        const output = await api.runDoctor();
                        setDoctorOutput(output);
                      } catch (e) {
                        setDoctorError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setDoctorLoading(false);
                      }
                    }}
                  >
                    {doctorLoading ? <BreathingDots className="h-4 w-4 mr-2" /> : null}
                    Run Health Check
                  </Button>
                </div>
                {doctorError && (
                  <p className="text-xs text-destructive">{doctorError}</p>
                )}
                {doctorOutput && (
                  <pre className="text-xs font-mono bg-muted rounded p-3 overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {doctorOutput}
                  </pre>
                )}
              </Card>
              </div>
              )}

              {activeSection === 'interface' && (
              <div className="space-y-6">
              <Card className="p-6 space-y-6">
                <div>
                  <h3 className="text-heading-4 mb-4">Interface Settings</h3>
                  <p className="text-body-small text-muted-foreground mb-6">
                    Customize the appearance and behavior of the user interface
                  </p>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-2">
                      <Label htmlFor="sidebar-default-open" className="text-label">
                        Sidebar visible by default
                      </Label>
                      <Switch
                        id="sidebar-default-open"
                        checked={sidebarDefaultOpen}
                        onCheckedChange={setSidebarDefaultOpen}
                      />
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <Label htmlFor="status-bar-visible" className="text-label">
                        Show session status bar
                      </Label>
                      <Switch
                        id="status-bar-visible"
                        checked={statusBarVisible}
                        onCheckedChange={setStatusBarVisible}
                      />
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <Label htmlFor="work-block-auto-expand" className="text-label">
                        Auto-expand work blocks
                      </Label>
                      <Switch
                        id="work-block-auto-expand"
                        checked={workBlockAutoExpand}
                        onCheckedChange={setWorkBlockAutoExpand}
                      />
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <Label htmlFor="show-streaming-indicator" className="text-label">
                        Show streaming indicator
                      </Label>
                      <Switch
                        id="show-streaming-indicator"
                        checked={showStreamingIndicator}
                        onCheckedChange={setShowStreamingIndicator}
                      />
                    </div>
                  </div>
                </div>
              </Card>
              </div>
              )}

              {activeSection === 'theme' && (
              <div className="space-y-6">
              <Card className="p-6 space-y-6">
                <div>
                  <h3 className="text-heading-4 mb-4">Theme Mode</h3>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg">
                      <button
                        onClick={() => setTheme('dark')}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                          theme === 'dark'
                            ? "bg-background shadow-sm"
                            : "hover:bg-background/50"
                        )}
                      >
                        {theme === 'dark' && <Check className="h-3 w-3" />}
                        Dark
                      </button>
                      <button
                        onClick={() => setTheme('gray')}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                          theme === 'gray'
                            ? "bg-background shadow-sm"
                            : "hover:bg-background/50"
                        )}
                      >
                        {theme === 'gray' && <Check className="h-3 w-3" />}
                        Gray
                      </button>
                      <button
                        onClick={() => setTheme('light')}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                          theme === 'light'
                            ? "bg-background shadow-sm"
                            : "hover:bg-background/50"
                        )}
                      >
                        {theme === 'light' && <Check className="h-3 w-3" />}
                        Light
                      </button>
                      <button
                        onClick={() => setTheme('custom')}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                          theme === 'custom'
                            ? "bg-background shadow-sm"
                            : "hover:bg-background/50"
                        )}
                      >
                        {theme === 'custom' && <Check className="h-3 w-3" />}
                        Custom
                      </button>
                    </div>
                  </div>
                </div>
              </Card>

              {theme === 'custom' && (
              <Card className="p-6 space-y-4">
                <h3 className="text-heading-4">Custom Colors</h3>

                <div className="space-y-3">
                  {/* Surface section */}
                  <div className="border border-border rounded-md overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
                      onClick={() => setColorSectionOpen(s => ({ ...s, surface: !s.surface }))}
                    >
                      <span>Surface</span>
                      {colorSectionOpen.surface ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {colorSectionOpen.surface && (
                      <div className="p-4 grid grid-cols-2 gap-4">
                        <ColorField id="color-background" label="Background" value={customColors.background} onChange={(v) => setCustomColors({ background: v })} placeholder="rgba(22,24,30,1)" />
                        <ColorField id="color-card" label="Card" value={customColors.card} onChange={(v) => setCustomColors({ card: v })} placeholder="rgba(30,32,40,1)" />
                        <ColorField id="color-muted" label="Muted" value={customColors.muted} onChange={(v) => setCustomColors({ muted: v })} placeholder="rgba(34,36,45,1)" />
                        <ColorField id="color-accent" label="Accent" value={customColors.accent} onChange={(v) => setCustomColors({ accent: v })} placeholder="rgba(38,41,50,1)" />
                        <ColorField id="color-border" label="Border" value={customColors.border} onChange={(v) => setCustomColors({ border: v })} placeholder="rgba(44,47,57,1)" />
                      </div>
                    )}
                  </div>

                  {/* Text section */}
                  <div className="border border-border rounded-md overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
                      onClick={() => setColorSectionOpen(s => ({ ...s, text: !s.text }))}
                    >
                      <span>Text</span>
                      {colorSectionOpen.text ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {colorSectionOpen.text && (
                      <div className="p-4 grid grid-cols-2 gap-4">
                        <ColorField id="color-foreground" label="Foreground" value={customColors.foreground} onChange={(v) => setCustomColors({ foreground: v })} placeholder="rgba(238,241,247,1)" />
                        <ColorField id="color-mutedForeground" label="Muted Foreground" value={customColors.mutedForeground} onChange={(v) => setCustomColors({ mutedForeground: v })} placeholder="rgba(148,153,171,1)" />
                      </div>
                    )}
                  </div>

                  {/* Interactive section */}
                  <div className="border border-border rounded-md overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
                      onClick={() => setColorSectionOpen(s => ({ ...s, interactive: !s.interactive }))}
                    >
                      <span>Interactive</span>
                      {colorSectionOpen.interactive ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {colorSectionOpen.interactive && (
                      <div className="p-4 grid grid-cols-2 gap-4">
                        <ColorField id="color-primary" label="Primary" value={customColors.primary} onChange={(v) => setCustomColors({ primary: v })} placeholder="rgba(238,241,247,1)" />
                        <ColorField id="color-destructive" label="Destructive" value={customColors.destructive} onChange={(v) => setCustomColors({ destructive: v })} placeholder="rgba(212,80,52,1)" />
                        <ColorField id="color-ring" label="Ring" value={customColors.ring} onChange={(v) => setCustomColors({ ring: v })} placeholder="rgba(108,112,130,1)" />
                      </div>
                    )}
                  </div>

                  {/* Chat Colors section */}
                  <div className="border border-border rounded-md overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
                      onClick={() => setColorSectionOpen(s => ({ ...s, chat: !s.chat }))}
                    >
                      <span>Chat Colors</span>
                      {colorSectionOpen.chat ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {colorSectionOpen.chat && (
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <ColorField id="chat-user-border" label="User bubble border" value={customColors.chatUserBorder} onChange={(v) => setCustomColors({ chatUserBorder: v })} placeholder="rgba(251,191,36,0.40)" />
                          <ColorField id="chat-user-bg" label="User bubble background" value={customColors.chatUserBg} onChange={(v) => setCustomColors({ chatUserBg: v })} placeholder="rgba(251,191,36,0.07)" />
                          <ColorField id="chat-work-border" label="Work block line" value={customColors.chatWorkBorder} onChange={(v) => setCustomColors({ chatWorkBorder: v })} placeholder="rgba(99,179,237,0.35)" />
                          <ColorField id="chat-agent-border" label="Agent card border" value={customColors.chatAgentBorder} onChange={(v) => setCustomColors({ chatAgentBorder: v })} placeholder="rgba(255,255,255,0.07)" />
                          <ColorField id="chat-agent-bg" label="Agent card background" value={customColors.chatAgentBg} onChange={(v) => setCustomColors({ chatAgentBg: v })} placeholder="rgba(255,255,255,0.02)" />
                          <ColorField id="chat-final-border" label="Final response border" value={customColors.chatFinalBorder} onChange={(v) => setCustomColors({ chatFinalBorder: v })} placeholder="rgba(74,222,128,0.50)" />
                          <ColorField id="chat-final-bg" label="Final response background" value={customColors.chatFinalBg} onChange={(v) => setCustomColors({ chatFinalBg: v })} placeholder="rgba(22,163,74,0.13)" />
                          <ColorField id="chat-result-ok-border" label="Result ok border" value={customColors.chatResultOkBorder} onChange={(v) => setCustomColors({ chatResultOkBorder: v })} placeholder="rgba(74,222,128,0.40)" />
                          <ColorField id="chat-result-ok-bg" label="Result ok background" value={customColors.chatResultOkBg} onChange={(v) => setCustomColors({ chatResultOkBg: v })} placeholder="rgba(22,163,74,0.09)" />
                          <ColorField id="chat-result-err-border" label="Result error border" value={customColors.chatResultErrBorder} onChange={(v) => setCustomColors({ chatResultErrBorder: v })} placeholder="rgba(248,113,113,0.50)" />
                          <ColorField id="chat-result-err-bg" label="Result error background" value={customColors.chatResultErrBg} onChange={(v) => setCustomColors({ chatResultErrBg: v })} placeholder="rgba(239,68,68,0.11)" />
                          <ColorField id="chat-terminal-command" label="Terminal command" value={customColors.chatTerminalCommand} onChange={(v) => setCustomColors({ chatTerminalCommand: v })} placeholder="rgba(74,222,128,1)" />
                          <ColorField id="chat-terminal-output" label="Terminal output" value={customColors.chatTerminalOutput} onChange={(v) => setCustomColors({ chatTerminalOutput: v })} placeholder="rgba(134,239,172,1)" />
                        </div>
                        <ChatPreview />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
              )}


              <Card className="p-6 space-y-4">
                <h3 className="text-heading-4">Typography</h3>

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm mb-1.5 block">UI Font</Label>
                    {fontsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <BreathingDots className="h-3 w-3" /> Loading fonts...
                      </div>
                    ) : (
                      <Select value={fontSans || '__default__'} onValueChange={v => handleFontSansChange(v === '__default__' ? '' : v)}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="System default" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          <SelectItem value="__default__">System default</SelectItem>
                          {systemFonts.filter(f => !f.is_monospace).map(f => (
                            <SelectItem key={f.name} value={f.name} style={{ fontFamily: f.name }}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div>
                    <Label className="text-sm mb-1.5 block">Monospace Font</Label>
                    {fontsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <BreathingDots className="h-3 w-3" /> Loading fonts...
                      </div>
                    ) : (
                      <Select value={fontMono || '__default__'} onValueChange={v => handleFontMonoChange(v === '__default__' ? '' : v)}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="System default" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          <SelectItem value="__default__">System default</SelectItem>
                          {systemFonts.filter(f => f.is_monospace).map(f => (
                            <SelectItem key={f.name} value={f.name} style={{ fontFamily: f.name }}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div>
                    <Label className="text-sm mb-1.5 block">Font Size: {fontSize}px</Label>
                    <input
                      type="range"
                      min={12}
                      max={20}
                      step={1}
                      value={fontSize}
                      onChange={e => handleFontSizeChange(Number(e.target.value))}
                      className="w-full h-2 accent-primary cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>12px</span>
                      <span>20px</span>
                    </div>
                  </div>
                </div>
              </Card>
              </div>
              )}

              {activeSection === 'permissions' && (
              <div className="space-y-6">
              <Card className="p-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-heading-4 mb-2">Permission Rules</h3>
                    <p className="text-body-small text-muted-foreground mb-4">
                      Control which tools Claude Code can use without manual approval
                    </p>
                  </div>
                  
                  {/* Allow Rules */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-label text-green-500">Allow Rules</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addPermissionRule("allow")}
                        className="gap-2 hover:border-green-500/50 hover:text-green-500"
                      >
                        <Plus className="h-3 w-3" />
                        Add Rule
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {allowRules.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">
                          No allow rules configured. Claude will ask for approval for all tools.
                        </p>
                      ) : (
                        allowRules.map((rule) => (
                          <motion.div
                            key={rule.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.15 }}
                            className="flex items-center gap-2"
                          >
                            <Input
                              placeholder="e.g., Bash(npm run test:*)"
                              value={rule.value}
                              onChange={(e) => updatePermissionRule("allow", rule.id, e.target.value)}
                              className="flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removePermissionRule("allow", rule.id)}
                              className="h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                  
                  {/* Deny Rules */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-label text-red-500">Deny Rules</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addPermissionRule("deny")}
                        className="gap-2 hover:border-red-500/50 hover:text-red-500"
                      >
                        <Plus className="h-3 w-3" />
                        Add Rule
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {denyRules.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">
                          No deny rules configured.
                        </p>
                      ) : (
                        denyRules.map((rule) => (
                          <motion.div
                            key={rule.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.15 }}
                            className="flex items-center gap-2"
                          >
                            <Input
                              placeholder="e.g., Bash(curl:*)"
                              value={rule.value}
                              onChange={(e) => updatePermissionRule("deny", rule.id, e.target.value)}
                              className="flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removePermissionRule("deny", rule.id)}
                              className="h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                  
                  <div className="pt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      <strong>Examples:</strong>
                    </p>
                    <ul className="text-caption text-muted-foreground space-y-1 ml-4">
                      <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Bash</code> - Allow all bash commands</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Bash(npm run build)</code> - Allow exact command</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Bash(npm run test:*)</code> - Allow commands with prefix</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Read(~/.zshrc)</code> - Allow reading specific file</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Edit(docs/**)</code> - Allow editing files in docs directory</li>
                    </ul>
                  </div>
                </div>
              </Card>
              </div>
              )}

              {activeSection === 'environment' && (
              <div className="space-y-6">
              <Card className="p-6">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-heading-4">Environment Variables</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Environment variables applied to every Claude Code session
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addEnvVar}
                      className="gap-2"
                    >
                      <Plus className="h-3 w-3" />
                      Add Variable
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {envVars.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        No environment variables configured.
                      </p>
                    ) : (
                      envVars.map((envVar) => (
                        <motion.div
                          key={envVar.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-2"
                        >
                          <Input
                            placeholder="KEY"
                            value={envVar.key}
                            onChange={(e) => updateEnvVar(envVar.id, "key", e.target.value)}
                            className="flex-1 font-mono text-sm"
                          />
                          <span className="text-muted-foreground">=</span>
                          <Input
                            placeholder="value"
                            value={envVar.value}
                            onChange={(e) => updateEnvVar(envVar.id, "value", e.target.value)}
                            className="flex-1 font-mono text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeEnvVar(envVar.id)}
                            className="h-8 w-8 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </motion.div>
                      ))
                    )}
                  </div>
                  
                  <div className="pt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      <strong>Common variables:</strong>
                    </p>
                    <ul className="text-caption text-muted-foreground space-y-1 ml-4">
                      <li>• <code className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">CLAUDE_CODE_ENABLE_TELEMETRY</code> - Enable/disable telemetry (0 or 1)</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">ANTHROPIC_MODEL</code> - Custom model name</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">DISABLE_COST_WARNINGS</code> - Disable cost warnings (1)</li>
                    </ul>
                  </div>
                </div>
              </Card>
              </div>
              )}

              {activeSection === 'advanced' && (
              <div className="space-y-6">
              <Card className="p-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold mb-4">Advanced Settings</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      Additional configuration options for advanced users
                    </p>
                  </div>

                  {/* Developer Debug Mode */}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="debug-mode-toggle" className="text-label">
                        Developer debug mode
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Enables verbose console logging and raw message inspection in the chat view
                      </p>
                    </div>
                    <Switch
                      id="debug-mode-toggle"
                      checked={debugMode}
                      onCheckedChange={setDebugMode}
                    />
                  </div>

                  {/* API Key Helper */}
                  <div className="space-y-2">
                    <Label htmlFor="apiKeyHelper">API Key Helper Script</Label>
                    <Input
                      id="apiKeyHelper"
                      placeholder="/path/to/generate_api_key.sh"
                      value={settings?.apiKeyHelper || ""}
                      onChange={(e) => updateSetting("apiKeyHelper", e.target.value || undefined)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Custom script to generate auth values for API requests
                    </p>
                  </div>
                  
                  {/* Raw JSON Editor */}
                  <div className="space-y-2">
                    <Label>Raw Settings (JSON)</Label>
                    <div className="p-3 rounded-md bg-muted font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                      <pre>{JSON.stringify(settings, null, 2)}</pre>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This shows the raw JSON that will be saved to ~/.claude/settings.json
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">Auto-Mode Config</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Current allow/deny rules from <code className="font-mono">claude auto-mode config</code>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={autoModeLoading}
                    onClick={async () => {
                      setAutoModeLoading(true);
                      setAutoModeError(null);
                      try {
                        const config = await api.getAutoModeConfig();
                        setAutoModeConfig(config);
                      } catch (e) {
                        setAutoModeError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setAutoModeLoading(false);
                      }
                    }}
                  >
                    {autoModeLoading ? <BreathingDots className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="ml-2">{autoModeConfig ? 'Refresh' : 'Load'}</span>
                  </Button>
                </div>
                {autoModeError && (
                  <p className="text-xs text-destructive">{autoModeError}</p>
                )}
                {autoModeConfig !== null && (
                  <div className="p-3 rounded-md bg-muted font-mono text-xs overflow-x-auto max-h-64">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(autoModeConfig, null, 2)}</pre>
                  </div>
                )}
              </Card>
              </div>
              )}

{activeSection === 'commands' && (
              <div>
              <Card className="p-6">
                <SlashCommandsManager className="p-0" />
              </Card>
              </div>
              )}


              {activeSection === 'proxy' && (
              <div>
              <Card className="p-6">
                <ProxySettings
                  setToast={setToast}
                  onChange={(hasChanges, _getSettings, save) => {
                    setProxySettingsChanged(hasChanges);
                    saveProxySettings.current = save;
                  }}
                />
              </Card>
              </div>
              )}

              {activeSection === 'skills' && (
              <div className="space-y-6 mt-6">
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-heading-4">Installed Skills</h3>
                    <p className="text-body-small text-muted-foreground mt-1">
                      Skills installed in ~/.claude/skills/
                    </p>
                  </div>
                  <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                    <Button
                      onClick={loadSkills}
                      disabled={skillsLoading}
                      variant="outline"
                      size="sm"
                    >
                      <RefreshCw className={cn("h-4 w-4 mr-2", skillsLoading && "animate-spin")} />
                      Refresh
                    </Button>
                  </motion.div>
                </div>

                {skillsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <BreathingDots className="h-6 w-6 text-muted-foreground" />
                  </div>
                ) : skills.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-full">
                      <BookOpen className="h-8 w-8 text-primary/60" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">No skills installed</p>
                      <p className="text-xs text-muted-foreground mt-1">Skills live in ~/.claude/skills/ — install a skill to see it here</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {skills.sort((a, b) => b.usage_count - a.usage_count).map((skill) => {
                      const isExpanded = expandedSkill === skill.name;
                      return (
                        <div key={skill.name} className="border rounded-lg overflow-hidden">
                          <button
                            onClick={async () => {
                              if (isExpanded) {
                                setExpandedSkill(null);
                              } else {
                                setExpandedSkill(skill.name);
                                if (!skillContent[skill.name]) {
                                  try {
                                    const content = await api.readPlanFile(skill.path);
                                    setSkillContent(prev => ({ ...prev, [skill.name]: content }));
                                  } catch {
                                    setSkillContent(prev => ({ ...prev, [skill.name]: 'Failed to load skill content.' }));
                                  }
                                }
                              }
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                          >
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{skill.display_name || skill.name}</span>
                                {skill.usage_count > 0 && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                    {skill.usage_count} {skill.usage_count === 1 ? 'use' : 'uses'}
                                  </span>
                                )}
                              </div>
                              {skill.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{skill.description}</p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground/60 font-mono shrink-0">{skill.name}</span>
                          </button>
                          {isExpanded && (
                            <div className="border-t bg-muted/20 px-4 py-3 max-h-64 overflow-y-auto">
                              {skillContent[skill.name] ? (
                                <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80 leading-relaxed">
                                  {skillContent[skill.name]}
                                </pre>
                              ) : (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                  <BreathingDots className="h-3 w-3" />
                                  Loading...
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
              </div>
              )}


{activeSection === 'agents' && (
              <div className="h-full">
                <Agents />
              </div>
              )}

              {activeSection === 'claude-md' && (
              <div className="h-full">
                <MarkdownEditor onBack={() => {}} />
              </div>
              )}

              {activeSection === 'claude-explorer' && (
              <div className="h-full">
                <ClaudeExplorer />
              </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 
