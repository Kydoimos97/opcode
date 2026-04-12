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
  Database,
  Network,
  Package,
  Eye,
  Shield,
  Terminal,
  Command,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  api,
  type ClaudeSettings,
  type ClaudeInstallation,
  type SkillInfo,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { ClaudeVersionSelector } from "./ClaudeVersionSelector";
import { StorageTab } from "./StorageTab";
import { HooksEditor } from "./HooksEditor";
import { SlashCommandsManager } from "./SlashCommandsManager";
import { ProxySettings } from "./ProxySettings";
import { useTheme } from "@/hooks";
import { TabPersistenceService } from "@/services/tabPersistence";

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

const NAV_ITEMS = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'interface', label: 'Interface', icon: Layout },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'environment', label: 'Environment', icon: Terminal },
  { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
  { id: 'hooks', label: 'Hooks', icon: Zap },
  { id: 'commands', label: 'Commands', icon: Command },
  { id: 'storage', label: 'Storage', icon: Database },
  { id: 'proxy', label: 'Proxy', icon: Network },
  { id: 'skills', label: 'Skills', icon: Package },
  { id: 'hooks-display', label: 'Hooks Display', icon: Eye },
  { id: 'cguard', label: 'c-guard', icon: ShieldCheck },
] as const;
type SectionId = typeof NAV_ITEMS[number]['id'];

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
  const [commandsConfLoading, setCommandsConfLoading] = useState(false);
  const [commandsConfVerifyOutput, setCommandsConfVerifyOutput] = useState("");
  const [cguardAuditInput, setCguardAuditInput] = useState("");
  const [cguardAuditOutput, setCguardAuditOutput] = useState("");
  const [cguardAuditLoading, setCguardAuditLoading] = useState(false);
  const [cguardUsageOutput, setCguardUsageOutput] = useState("");
  const [cguardUsageLoading, setCguardUsageLoading] = useState(false);

  const [sidebarDefaultOpen, setSidebarDefaultOpen] = useState(false);
  const [statusBarVisible, setStatusBarVisible] = useState(true);
  const [workBlockAutoExpand, setWorkBlockAutoExpand] = useState(false);
  const [showStreamingIndicator, setShowStreamingIndicator] = useState(true);

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
      const pref = await api.getSetting('startup_intro_enabled');
      setStartupIntroEnabled(pref === null ? true : pref === 'true');
    })();
  }, []);

  /**
   * Loads analytics settings
   */
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
      const content = await api.readCommandsConf();
      setCommandsConfContent(content);
      setCommandsConfVerifyOutput("");
    } catch (err) {
      console.error("Failed to load commands.conf:", err);
      setCommandsConfContent("");
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
    try {
      setSaving(true);
      setError(null);
      setToast(null);

      // Build the settings object
      const updatedSettings: ClaudeSettings = {
        ...settings,
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

      // Save Claude binary path if changed
      if (binaryPathChanged && selectedInstallation) {
        await api.setClaudeBinaryPath(selectedInstallation.path);
        setCurrentBinaryPath(selectedInstallation.path);
        setBinaryPathChanged(false);
      }

      // Save user hooks if changed
      if (userHooksChanged && getUserHooks.current) {
        const hooks = getUserHooks.current();
        await api.updateHooksConfig('user', hooks);
        setUserHooksChanged(false);
      }

      // Save proxy settings if changed
      if (proxySettingsChanged && saveProxySettings.current) {
        await saveProxySettings.current();
        setProxySettingsChanged(false);
      }

      setToast({ message: "Settings saved successfully!", type: "success" });
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError("Failed to save settings.");
      setToast({ message: "Failed to save settings", type: "error" });
    } finally {
      setSaving(false);
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
            {NAV_ITEMS.map(item => (
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
                  <h3 className="text-heading-4 mb-4">General Settings</h3>
                  
                  <div className="space-y-4">
                    {/* Theme Selector */}
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Theme</Label>
                        <p className="text-caption text-muted-foreground mt-1">
                          Choose your preferred color theme
                        </p>
                      </div>
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
                    
                    {/* Custom Color Editor */}
                    {theme === 'custom' && (
                      <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                        <h4 className="text-label">Custom Theme Colors</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                          {/* Background Color */}
                          <div className="space-y-2">
                            <Label htmlFor="color-background" className="text-caption">Background</Label>
                            <div className="flex gap-2">
                              <Input
                                id="color-background"
                                type="text"
                                value={customColors.background}
                                onChange={(e) => setCustomColors({ background: e.target.value })}
                                placeholder="oklch(0.12 0.01 240)"
                                className="font-mono text-xs"
                              />
                              <div 
                                className="w-10 h-10 rounded border"
                                style={{ backgroundColor: customColors.background }}
                              />
                            </div>
                          </div>
                          
                          {/* Foreground Color */}
                          <div className="space-y-2">
                            <Label htmlFor="color-foreground" className="text-caption">Foreground</Label>
                            <div className="flex gap-2">
                              <Input
                                id="color-foreground"
                                type="text"
                                value={customColors.foreground}
                                onChange={(e) => setCustomColors({ foreground: e.target.value })}
                                placeholder="oklch(0.98 0.01 240)"
                                className="font-mono text-xs"
                              />
                              <div 
                                className="w-10 h-10 rounded border"
                                style={{ backgroundColor: customColors.foreground }}
                              />
                            </div>
                          </div>
                          
                          {/* Primary Color */}
                          <div className="space-y-2">
                            <Label htmlFor="color-primary" className="text-caption">Primary</Label>
                            <div className="flex gap-2">
                              <Input
                                id="color-primary"
                                type="text"
                                value={customColors.primary}
                                onChange={(e) => setCustomColors({ primary: e.target.value })}
                                placeholder="oklch(0.98 0.01 240)"
                                className="font-mono text-xs"
                              />
                              <div 
                                className="w-10 h-10 rounded border"
                                style={{ backgroundColor: customColors.primary }}
                              />
                            </div>
                          </div>
                          
                          {/* Card Color */}
                          <div className="space-y-2">
                            <Label htmlFor="color-card" className="text-caption">Card</Label>
                            <div className="flex gap-2">
                              <Input
                                id="color-card"
                                type="text"
                                value={customColors.card}
                                onChange={(e) => setCustomColors({ card: e.target.value })}
                                placeholder="oklch(0.14 0.01 240)"
                                className="font-mono text-xs"
                              />
                              <div 
                                className="w-10 h-10 rounded border"
                                style={{ backgroundColor: customColors.card }}
                              />
                            </div>
                          </div>
                          
                          {/* Accent Color */}
                          <div className="space-y-2">
                            <Label htmlFor="color-accent" className="text-caption">Accent</Label>
                            <div className="flex gap-2">
                              <Input
                                id="color-accent"
                                type="text"
                                value={customColors.accent}
                                onChange={(e) => setCustomColors({ accent: e.target.value })}
                                placeholder="oklch(0.16 0.01 240)"
                                className="font-mono text-xs"
                              />
                              <div 
                                className="w-10 h-10 rounded border"
                                style={{ backgroundColor: customColors.accent }}
                              />
                            </div>
                          </div>
                          
                          {/* Destructive Color */}
                          <div className="space-y-2">
                            <Label htmlFor="color-destructive" className="text-caption">Destructive</Label>
                            <div className="flex gap-2">
                              <Input
                                id="color-destructive"
                                type="text"
                                value={customColors.destructive}
                                onChange={(e) => setCustomColors({ destructive: e.target.value })}
                                placeholder="oklch(0.6 0.2 25)"
                                className="font-mono text-xs"
                              />
                              <div 
                                className="w-10 h-10 rounded border"
                                style={{ backgroundColor: customColors.destructive }}
                              />
                            </div>
                          </div>
                        </div>
                        
                        <p className="text-caption text-muted-foreground">
                          Use CSS color values (hex, rgb, oklch, etc.). Changes apply immediately.
                        </p>
                      </div>
                    )}
                    
                    {/* Include Co-authored By */}
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
                    
                    {/* Verbose Output */}
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
                    
                    {/* Cleanup Period */}
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
                    
                    {/* Claude Binary Path Selector */}
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

                    {/* Separator */}
                    <div className="border-t border-border pt-4 mt-6" />

                    {/* Tab Persistence Toggle */}
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

                    {/* Startup Intro Toggle */}
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
                            await api.saveSetting('startup_intro_enabled', checked ? 'true' : 'false');
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

              {activeSection === 'storage' && (
              <div>
              <StorageTab />
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
                              Save & Verify
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
