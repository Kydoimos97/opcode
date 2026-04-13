import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Save,
  AlertCircle,
  Loader2,
  Check,
  RefreshCw,
  Code,
  Settings2,
  Layout,
  SlidersHorizontal,
  Zap,
  Network,
  Package,
  Eye,
  Shield,
  Terminal,
  Command,
  ShieldCheck,
  Palette,
} from "lucide-react";
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
import { HooksEditor } from "./HooksEditor";
import { SlashCommandsManager } from "./SlashCommandsManager";
import { ProxySettings } from "./ProxySettings";
import { useTheme } from "@/hooks";
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
  { id: 'hooks-display', label: 'Hooks Display', icon: Eye },
] as const;

const CLAUDE_NAV_ITEMS = [
  { id: 'hooks', label: 'Hooks', icon: Zap },
  { id: 'commands', label: 'Commands', icon: Command },
  { id: 'cguard', label: 'c-guard', icon: ShieldCheck },
  { id: 'skills', label: 'Skills', icon: Package },
] as const;

type SectionId = typeof CCODE_NAV_ITEMS[number]['id'] | typeof CLAUDE_NAV_ITEMS[number]['id'];

const DEFAULT_COMMANDS_CONF_TEMPLATE = `# c-guard commands configuration
# Lines starting with # are comments
# Format: ALLOW <pattern> or DENY <pattern>
# Patterns support wildcards: * matches anything

# Allow common development tools
ALLOW git *
ALLOW npm *
ALLOW pnpm *
ALLOW cargo *

# Deny destructive operations
DENY rm -rf /
DENY format *
`;

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

  // Hooks display state
  const [globalSettings, setGlobalSettings] = useState<Record<string, any>>({});
  const [hooksLoading, setHooksLoading] = useState(false);

  // c-guard state
  const [cguardEnabled, setCguardEnabled] = useState(false);
  const [commandsConfContent, setCommandsConfContent] = useState("");
  const [commandsConfExists, setCommandsConfExists] = useState(false);
  const [commandsConfLoading, setCommandsConfLoading] = useState(false);
  const [commandsConfVerifyOutput, setCommandsConfVerifyOutput] = useState("");
  const [cguardInstalled, setCguardInstalled] = useState<{ script_exists: boolean; hook_wired: boolean; installed: boolean } | null>(null);
  const [cguardAuditInput, setCguardAuditInput] = useState("");
  const [cguardAuditOutput, setCguardAuditOutput] = useState("");
  const [cguardAuditLoading, setCguardAuditLoading] = useState(false);
  const [cguardUsageOutput, setCguardUsageOutput] = useState("");
  const [cguardUsageLoading, setCguardUsageLoading] = useState(false);

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

  const [hookBridgeInstalled, setHookBridgeInstalled] = useState(false);
  const [hookBridgeLoading, setHookBridgeLoading] = useState(false);

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
      const cguardStatus = await api.checkCguardInstalled();
      setCguardInstalled(cguardStatus);
      const bridgeInstalled = await api.checkHookBridgeInstalled().catch(() => false);
      setHookBridgeInstalled(bridgeInstalled);

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
   * Loads global settings to display hooks
   */
  const loadGlobalSettings = async () => {
    try {
      setHooksLoading(true);
      const settings = await api.getGlobalSettings();
      setGlobalSettings(settings);

      // Check if c-guard is enabled
      const hooks = settings.hooks || {};
      const preToolUseHooks = hooks.PreToolUse || [];
      const isCguardEnabled = Array.isArray(preToolUseHooks) &&
        preToolUseHooks.some((hook: any) =>
          typeof hook === 'object' && hook.hook_dispatcher &&
          hook.hook_dispatcher.includes('hook-dispatcher')
        );
      setCguardEnabled(isCguardEnabled);
    } catch (err) {
      console.error("Failed to load global settings:", err);
      setGlobalSettings({});
    } finally {
      setHooksLoading(false);
    }
  };

  /**
   * Loads commands.conf content
   */
  const loadCommandsConf = async () => {
    try {
      setCommandsConfLoading(true);
      const result = await api.readCommandsConf();
      setCommandsConfExists(result.exists);
      if (result.exists) {
        setCommandsConfContent(result.content);
      } else {
        setCommandsConfContent(DEFAULT_COMMANDS_CONF_TEMPLATE);
      }
      setCommandsConfVerifyOutput("");
    } catch (err) {
      console.error("Failed to load commands.conf:", err);
      setCommandsConfContent(DEFAULT_COMMANDS_CONF_TEMPLATE);
      setCommandsConfExists(false);
    } finally {
      setCommandsConfLoading(false);
    }
  };

  /**
   * Saves and verifies commands.conf
   */
  const saveCommandsConf = async () => {
    try {
      setCommandsConfLoading(true);
      const output = await api.writeAndVerifyCommandsConf(commandsConfContent);
      setCommandsConfVerifyOutput(output);
      setToast({
        message: "commands.conf saved successfully",
        type: "success",
      });
    } catch (err) {
      console.error("Failed to save commands.conf:", err);
      setCommandsConfVerifyOutput(`Error: ${String(err)}`);
      setToast({
        message: "Failed to save commands.conf",
        type: "error",
      });
    } finally {
      setCommandsConfLoading(false);
    }
  };

  /**
   * Toggles c-guard enabled state
   */
  const handleCguardToggle = async (newValue: boolean) => {
    try {
      await api.setCguardEnabled(newValue);
      setCguardEnabled(newValue);
      setToast({
        message: newValue ? "c-guard enabled" : "c-guard disabled",
        type: "success",
      });
      // Refresh global settings to reflect the change
      await loadGlobalSettings();
    } catch (err) {
      console.error("Failed to toggle c-guard:", err);
      setToast({
        message: "Failed to toggle c-guard",
        type: "error",
      });
    }
  };

  /**
   * Runs c-guard audit command
   */
  const runCguardAudit = async () => {
    if (!cguardAuditInput.trim()) {
      setToast({
        message: "Please enter a command to audit",
        type: "error",
      });
      return;
    }

    try {
      setCguardAuditLoading(true);
      const output = await api.runCguardCli(["--audit", cguardAuditInput]);
      setCguardAuditOutput(output);
    } catch (err) {
      console.error("Failed to run c-guard audit:", err);
      setCguardAuditOutput(`Error: ${String(err)}`);
      setToast({
        message: "Failed to run c-guard audit",
        type: "error",
      });
    } finally {
      setCguardAuditLoading(false);
    }
  };

  /**
   * Runs c-guard usage stats command
   */
  const runCguardUsageStats = async () => {
    try {
      setCguardUsageLoading(true);
      const output = await api.runCguardCli(["--usage"]);
      setCguardUsageOutput(output);
    } catch (err) {
      console.error("Failed to run c-guard usage stats:", err);
      setCguardUsageOutput(`Error: ${String(err)}`);
      setToast({
        message: "Failed to run c-guard usage stats",
        type: "error",
      });
    } finally {
      setCguardUsageLoading(false);
    }
  };

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
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
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
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
              <Card className="p-6 space-y-6">
                <div>
                  <h3 className="text-heading-4 mb-4">Opcode Settings</h3>
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
              <Card className="p-6 space-y-6">
                <div>
                  <h3 className="text-heading-4 mb-4">Custom Colors</h3>

                  <div className="space-y-6">
                    <div>
                      <h4 className="text-label mb-4">Surface</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="color-background" className="text-caption">Background</Label>
                          <div className="flex gap-2">
                            <Input
                              id="color-background"
                              type="text"
                              value={customColors.background}
                              onChange={(e) => setCustomColors({ background: e.target.value })}
                              placeholder="oklch(0.12 0.01 240)"
                              className="font-mono text-xs flex-1"
                            />
                            <div
                              className="w-10 h-10 rounded border flex-shrink-0"
                              style={{ backgroundColor: customColors.background }}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="color-card" className="text-caption">Card</Label>
                          <div className="flex gap-2">
                            <Input
                              id="color-card"
                              type="text"
                              value={customColors.card}
                              onChange={(e) => setCustomColors({ card: e.target.value })}
                              placeholder="oklch(0.14 0.01 240)"
                              className="font-mono text-xs flex-1"
                            />
                            <div
                              className="w-10 h-10 rounded border flex-shrink-0"
                              style={{ backgroundColor: customColors.card }}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="color-muted" className="text-caption">Muted</Label>
                          <div className="flex gap-2">
                            <Input
                              id="color-muted"
                              type="text"
                              value={customColors.muted}
                              onChange={(e) => setCustomColors({ muted: e.target.value })}
                              placeholder="oklch(0.11 0.01 240)"
                              className="font-mono text-xs flex-1"
                            />
                            <div
                              className="w-10 h-10 rounded border flex-shrink-0"
                              style={{ backgroundColor: customColors.muted }}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="color-accent" className="text-caption">Accent</Label>
                          <div className="flex gap-2">
                            <Input
                              id="color-accent"
                              type="text"
                              value={customColors.accent}
                              onChange={(e) => setCustomColors({ accent: e.target.value })}
                              placeholder="oklch(0.16 0.01 240)"
                              className="font-mono text-xs flex-1"
                            />
                            <div
                              className="w-10 h-10 rounded border flex-shrink-0"
                              style={{ backgroundColor: customColors.accent }}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="color-border" className="text-caption">Border</Label>
                          <div className="flex gap-2">
                            <Input
                              id="color-border"
                              type="text"
                              value={customColors.border}
                              onChange={(e) => setCustomColors({ border: e.target.value })}
                              placeholder="oklch(0.18 0.01 240)"
                              className="font-mono text-xs flex-1"
                            />
                            <div
                              className="w-10 h-10 rounded border flex-shrink-0"
                              style={{ backgroundColor: customColors.border }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-label mb-4">Text</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="color-foreground" className="text-caption">Foreground</Label>
                          <div className="flex gap-2">
                            <Input
                              id="color-foreground"
                              type="text"
                              value={customColors.foreground}
                              onChange={(e) => setCustomColors({ foreground: e.target.value })}
                              placeholder="oklch(0.98 0.01 240)"
                              className="font-mono text-xs flex-1"
                            />
                            <div
                              className="w-10 h-10 rounded border flex-shrink-0"
                              style={{ backgroundColor: customColors.foreground }}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="color-mutedForeground" className="text-caption">Muted Foreground</Label>
                          <div className="flex gap-2">
                            <Input
                              id="color-mutedForeground"
                              type="text"
                              value={customColors.mutedForeground}
                              onChange={(e) => setCustomColors({ mutedForeground: e.target.value })}
                              placeholder="oklch(0.7 0.01 240)"
                              className="font-mono text-xs flex-1"
                            />
                            <div
                              className="w-10 h-10 rounded border flex-shrink-0"
                              style={{ backgroundColor: customColors.mutedForeground }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-label mb-4">Interactive</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="color-primary" className="text-caption">Primary</Label>
                          <div className="flex gap-2">
                            <Input
                              id="color-primary"
                              type="text"
                              value={customColors.primary}
                              onChange={(e) => setCustomColors({ primary: e.target.value })}
                              placeholder="oklch(0.98 0.01 240)"
                              className="font-mono text-xs flex-1"
                            />
                            <div
                              className="w-10 h-10 rounded border flex-shrink-0"
                              style={{ backgroundColor: customColors.primary }}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="color-destructive" className="text-caption">Destructive</Label>
                          <div className="flex gap-2">
                            <Input
                              id="color-destructive"
                              type="text"
                              value={customColors.destructive}
                              onChange={(e) => setCustomColors({ destructive: e.target.value })}
                              placeholder="oklch(0.6 0.2 25)"
                              className="font-mono text-xs flex-1"
                            />
                            <div
                              className="w-10 h-10 rounded border flex-shrink-0"
                              style={{ backgroundColor: customColors.destructive }}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="color-ring" className="text-caption">Ring</Label>
                          <div className="flex gap-2">
                            <Input
                              id="color-ring"
                              type="text"
                              value={customColors.ring}
                              onChange={(e) => setCustomColors({ ring: e.target.value })}
                              placeholder="oklch(0.62 0.2 29)"
                              className="font-mono text-xs flex-1"
                            />
                            <div
                              className="w-10 h-10 rounded border flex-shrink-0"
                              style={{ backgroundColor: customColors.ring }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
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
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading fonts...
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
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading fonts...
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
              </div>
              )}

              {activeSection === 'hooks' && (
              <div className="space-y-6">
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">C-Code Hook Integration</p>
                    <p className="text-xs text-muted-foreground">
                      Real-time tool indicators, auto session titles, and waiting state via hooks.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Changes take effect in your next Claude Code session.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
                      hookBridgeInstalled
                        ? 'bg-green-500/20 text-green-600'
                        : 'bg-muted text-muted-foreground'
                    )}>
                      <div className={cn('h-1.5 w-1.5 rounded-full', hookBridgeInstalled ? 'bg-green-500' : 'bg-muted-foreground')} />
                      {hookBridgeInstalled ? 'Installed' : 'Not installed'}
                    </div>
                    <Button
                      variant={hookBridgeInstalled ? 'outline' : 'default'}
                      size="sm"
                      disabled={hookBridgeLoading}
                      onClick={async () => {
                        setHookBridgeLoading(true);
                        try {
                          if (hookBridgeInstalled) {
                            await api.removeHookBridge();
                            setHookBridgeInstalled(false);
                            setToast({ message: 'Hook bridge removed', type: 'success' });
                          } else {
                            await api.installHookBridge();
                            setHookBridgeInstalled(true);
                            setToast({ message: 'Hook bridge installed', type: 'success' });
                          }
                        } catch (e) {
                          setToast({ message: `Failed: ${e}`, type: 'error' });
                        } finally {
                          setHookBridgeLoading(false);
                        }
                      }}
                    >
                      {hookBridgeLoading ? 'Working...' : hookBridgeInstalled ? 'Remove' : 'Install'}
                    </Button>
                  </div>
                </div>
              </Card>
              <Card className="p-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold mb-2">User Hooks</h3>
                    <p className="text-body-small text-muted-foreground mb-4">
                      Configure hooks that apply to all Claude Code sessions for your user account.
                      These are stored in <code className="mx-1 px-2 py-1 bg-muted rounded text-xs">~/.claude/settings.json</code>
                    </p>
                  </div>
                  
                  <HooksEditor
                    key={activeSection}
                    scope="user"
                    className="border-0"
                    hideActions={true}
                    onChange={(hasChanges, getHooks) => {
                      setUserHooksChanged(hasChanges);
                      getUserHooks.current = getHooks;
                    }}
                  />
                </div>
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
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : skills.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    No skills found in ~/.claude/skills/ — install skills to see them here
                  </div>
                ) : (
                  <div className="space-y-3">
                    {skills.map((skill) => (
                      <div key={skill.name} className="p-3 border rounded-lg bg-muted/30">
                        <h4 className="font-semibold text-sm">{skill.name}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{skill.description}</p>
                        <p className="text-xs text-muted-foreground mt-2 font-mono">{skill.path}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              </div>
              )}

              {activeSection === 'hooks-display' && (
              <div className="space-y-6 mt-6">
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-heading-4">Hooks Configuration</h3>
                    <p className="text-body-small text-muted-foreground mt-1">
                      Current hooks from ~/.claude/settings.json
                    </p>
                  </div>
                  <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                    <Button
                      onClick={loadGlobalSettings}
                      disabled={hooksLoading}
                      variant="outline"
                      size="sm"
                    >
                      <RefreshCw className={cn("h-4 w-4 mr-2", hooksLoading && "animate-spin")} />
                      Refresh
                    </Button>
                  </motion.div>
                </div>

                {hooksLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !globalSettings.hooks || Object.keys(globalSettings.hooks).length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    No hooks configured in ~/.claude/settings.json
                  </div>
                ) : (
                  <pre className="font-mono text-xs overflow-auto max-h-64 p-3 border rounded-lg bg-muted">
                    {JSON.stringify(globalSettings.hooks, null, 2)}
                  </pre>
                )}
              </Card>
              </div>
              )}

              {activeSection === 'cguard' && (
              <div className="space-y-6 mt-6">
              {/* Enable Toggle */}
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-heading-4">c-guard Status</h3>
                    <p className="text-body-small text-muted-foreground mt-1">
                      Enable or disable c-guard command auditing
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={cguardEnabled}
                      onCheckedChange={handleCguardToggle}
                      disabled={hooksLoading}
                    />
                  </div>
                </div>
                {cguardInstalled !== null && (
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    {cguardInstalled.installed ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-muted-foreground">c-guard is installed and active</span>
                      </>
                    ) : cguardInstalled.script_exists && !cguardInstalled.hook_wired ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                        <span className="text-muted-foreground">Script found but hook not wired — enable the toggle to activate</span>
                      </>
                    ) : (
                      <>
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        <span className="text-muted-foreground">command-guard.py not found at ~/.claude/hooks/</span>
                      </>
                    )}
                  </div>
                )}
              </Card>

              {/* commands.conf Editor */}
              <Card className="p-6 space-y-4">
                <div>
                  <h3 className="text-heading-4 mb-2">commands.conf Editor</h3>
                  <p className="text-body-small text-muted-foreground mb-4">
                    Configure allowed and denied commands at ~/.claude/hooks/resources/commands.conf
                  </p>
                </div>

                {commandsConfLoading && !commandsConfContent ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {!commandsConfExists && (
                      <div className="rounded-md border border-dashed border-border p-4 mb-4 text-sm text-muted-foreground">
                        commands.conf does not exist yet. Edit the template below and click "Save & Create" to create it.
                      </div>
                    )}
                    {commandsConfContent && (
                      <p className="text-xs text-muted-foreground mb-2">
                        {(() => {
                          const lines = commandsConfContent.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
                          const allow = lines.filter(l => l.trim().toUpperCase().startsWith('ALLOW')).length;
                          const deny = lines.filter(l => l.trim().toUpperCase().startsWith('DENY')).length;
                          return `${allow} allow rule${allow !== 1 ? 's' : ''}, ${deny} deny rule${deny !== 1 ? 's' : ''}`;
                        })()}
                      </p>
                    )}
                    <textarea
                      value={commandsConfContent}
                      onChange={(e) => setCommandsConfContent(e.target.value)}
                      className="font-mono text-xs h-64 w-full border rounded p-2 bg-background"
                      placeholder="Enter commands configuration..."
                    />
                    <div className="flex gap-2">
                      <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }} className="flex-1">
                        <Button
                          onClick={saveCommandsConf}
                          disabled={commandsConfLoading}
                          className="w-full"
                        >
                          {commandsConfLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              {commandsConfExists ? "Save & Verify" : "Save & Create"}
                            </>
                          )}
                        </Button>
                      </motion.div>
                      <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                        <Button
                          onClick={loadCommandsConf}
                          disabled={commandsConfLoading}
                          variant="outline"
                        >
                          <RefreshCw className={cn("h-4 w-4", commandsConfLoading && "animate-spin")} />
                        </Button>
                      </motion.div>
                    </div>

                    {commandsConfVerifyOutput && (
                      <pre
                        className={cn(
                          "font-mono text-xs p-3 border rounded-lg overflow-auto max-h-32",
                          commandsConfVerifyOutput.toLowerCase().includes("error")
                            ? "bg-destructive/10 border-destructive/50 text-destructive"
                            : commandsConfVerifyOutput.trim() === ""
                            ? "bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400"
                            : "bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {commandsConfVerifyOutput.trim() === ""
                          ? "Config is valid - no errors found"
                          : commandsConfVerifyOutput}
                      </pre>
                    )}
                  </>
                )}
              </Card>

              {/* CLI Tools Section */}
              <div className="space-y-6">
                {/* Audit */}
                <Card className="p-6 space-y-4">
                  <div>
                    <h3 className="text-heading-4 mb-2">Audit Command</h3>
                    <p className="text-body-small text-muted-foreground mb-4">
                      Audit a command to see if it would be allowed by c-guard
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="audit-command" className="text-sm mb-2">
                        Command to audit
                      </Label>
                      <Input
                        id="audit-command"
                        value={cguardAuditInput}
                        onChange={(e) => setCguardAuditInput(e.target.value)}
                        placeholder="e.g., npm install"
                        className="font-mono text-xs"
                      />
                    </div>

                    <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                      <Button
                        onClick={runCguardAudit}
                        disabled={cguardAuditLoading || !cguardAuditInput.trim()}
                        className="w-full"
                      >
                        {cguardAuditLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Code className="h-4 w-4 mr-2" />
                            Run Audit
                          </>
                        )}
                      </Button>
                    </motion.div>

                    {cguardAuditOutput && (
                      <pre className="font-mono text-xs p-3 border rounded-lg bg-muted overflow-auto max-h-48">
                        {cguardAuditOutput}
                      </pre>
                    )}
                  </div>
                </Card>

                {/* Usage Stats */}
                <Card className="p-6 space-y-4">
                  <div>
                    <h3 className="text-heading-4 mb-2">Usage Statistics</h3>
                    <p className="text-body-small text-muted-foreground mb-4">
                      View c-guard usage statistics and command execution history
                    </p>
                  </div>

                  <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                    <Button
                      onClick={runCguardUsageStats}
                      disabled={cguardUsageLoading}
                      className="w-full"
                    >
                      {cguardUsageLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <Code className="h-4 w-4 mr-2" />
                          Show Usage Stats
                        </>
                      )}
                    </Button>
                  </motion.div>

                  {cguardUsageOutput && (
                    <pre className="font-mono text-xs p-3 border rounded-lg bg-muted overflow-auto max-h-96">
                      {cguardUsageOutput}
                    </pre>
                  )}
                </Card>
              </div>
              </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 
