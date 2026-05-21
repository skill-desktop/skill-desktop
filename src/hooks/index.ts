// Skill hooks
export {
  useSkills,
  useSearchSkills,
  useSkillContent,
  useRescanLibrary,
  useDeleteSkill,
  useDeleteSkillsBatch,
  useExportSkillsBatch,
  useExportSkillsBatchJson,
  useRecordSkillChange,
  useSkillHistory,
  useRecentSkillHistory,
  useCheckSkillUpdate,
  useCheckAllSkillUpdates,
  useSetSkillCategory,
  skillKeys,
  type BatchDeleteResult,
  type SkillHistoryEntry,
  type UpdateCheckResult,
  type SkillUpdateInfo,
} from "./useSkills";

// Library hooks
export {
  useLibraryPath,
  useSetLibraryPath,
  useDefaultPaths,
  useEnsureDefaultSkillPath,
  libraryKeys,
  type DefaultPaths,
} from "./useLibrary";

// Space hooks
export {
  useSpaces,
  useSpace,
  useCreateSpace,
  useUpdateSpace,
  useDeleteSpace,
  useSyncSpace,
  useSetSkillVisibility,
  useVisibleSkills,
  useSkillVisibilityMap,
  useSetBulkSkillVisibility,
  useInitSpaceVisibility,
  useExportClaudeConfig,
  useExportGenericConfig,
  useExportMcpConfig,
  spaceKeys,
  type SyncResult,
} from "./useSpaces";

// Quarantine hooks
export {
  useQuarantinedSkills,
  useSetSkillQuarantine,
  quarantineKeys,
} from "./useQuarantine";

// File operations hooks
export {
  useShowInFolder,
  useOpenFile,
  useFileWatcher,
  useStartFileWatcher,
  useStopFileWatcher,
  useIsFileWatcherRunning,
  fileWatcherKeys,
} from "./useFileOperations";

// Import hooks
export {
  usePreviewSkillFromUrl,
  useImportSkillFromUrl,
  useUpdateSkillFromUrl,
  useBrowseGitHubRepo,
  usePreviewGitHubSkill,
  useImportGitHubSkill,
  useImportGitHubDirectory,
  importKeys,
  type SkillPreview,
  type GitHubFileEntry,
  type ImportResult,
} from "./useImport";

// Local import hooks (folder / .zip / .skill / loose .md)
export {
  usePreviewLocalSkill,
  useImportLocalSkill,
  useImportLocalSkillsBatch,
  useScanDirectoryForSkills,
  type LocalSkillCandidate,
  type LocalSourceType,
} from "./useLocalImport";

// MCP hooks
export {
  useConnectMcpServer,
  useImportMcpToolAsSkill,
  useSearchMcpRegistry,
  useFeaturedMcpServers,
  useMcpServerDetails,
  useImportMcpRegistryServer,
  mcpKeys,
  type McpTool,
  type McpRegistry,
  type McpRegistryEntry,
} from "./useMcp";

// App settings hooks
export {
  useLoadAppSettings,
  useSaveAppSettings,
  useUpdateAppSetting,
  appSettingsKeys,
  type AppSettings,
} from "./useAppSettings";

// LLM hooks
export {
  useLLM,
  useChatCompletion,
  useStreamingChat,
  useConversation,
  useTestLLMConnection,
} from "./useLLM";

// Skill creation hooks
export {
  useCreateSkill,
  useValidateSkillName,
  useValidateSkillDescription,
  useGetSkillResourceContent,
  useOpenSkillDirectory,
} from "./useSkillCreation";

// Sandbox hooks
export {
  useSkillScripts,
  useExecuteScript,
  sandboxKeys,
  type ExecutionResult,
  type ExecutionHistoryEntry,
} from "./useSandbox";

// Install to AI Tool hooks
export {
  useInstallTargets,
  useInstallSkillToTool,
  useUninstallSkillFromTool,
  useSkillInstallations,
  useAllSkillInstallations,
  useDetectAiTools,
  installKeys,
  type InstallTargetKind,
  type InstallTargetInfo,
  type InstallSkillResult,
  type SkillInstallation,
  type DetectedAiTool,
} from "./useInstall";

// AI Tools hooks
export {
  useAIToolsConfig,
  useClaudeCodeConfig,
  useCursorConfig,
  useOpenCodeConfig,
  useCursorMdcRules,
  useProjectAIConfigs,
  useSaveClaudeCodeConfig,
  useSaveCursorLegacyRules,
  useSaveCursorMdcRule,
  useSaveOpenCodeAgentsMd,
  useSaveOpenCodeConfigJson,
  useSaveProjectConfig,
  useCreateProjectConfig,
  useDeleteProjectConfig,
} from "./useAITools";
