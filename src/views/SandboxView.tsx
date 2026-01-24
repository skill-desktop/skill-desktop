import React from "react";
import { Play, RotateCcw, Clock, ChevronDown, AlertTriangle, Copy, Check, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, ScrollArea, Badge } from "@/components/ui";
import { useSkills, useSkillContent } from "@/hooks";
import { getPermissionLevel } from "@/types";
import type { Skill } from "@/types";

type ExecutionMode = "simulate" | "mcp";

export const SandboxView: React.FC = () => {
  const [selectedSkillHash, setSelectedSkillHash] = React.useState<string | null>(null);
  const [params, setParams] = React.useState<Record<string, string>>({});
  const [output, setOutput] = React.useState<string | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const [executionTime, setExecutionTime] = React.useState<number | null>(null);
  const [showSkillSelector, setShowSkillSelector] = React.useState(false);
  const [executionMode, setExecutionMode] = React.useState<ExecutionMode>("simulate");
  const [mcpServerUrl, setMcpServerUrl] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [executionHistory, setExecutionHistory] = React.useState<Array<{
    timestamp: string;
    skill: string;
    params: Record<string, string>;
    output: string;
    duration: number;
  }>>([]);

  const { data: skills = [] } = useSkills();
  const { data: skillContent } = useSkillContent(selectedSkillHash);

  const selectedSkill = skills.find((s) => s.hash === selectedSkillHash);

  // Check if skill has high-risk permissions
  const hasHighRiskPermissions = selectedSkill?.permissions.some(
    (p) => getPermissionLevel(p) === "high"
  );

  // Check if skill is from MCP (has mcp tag or network permission)
  const isMcpSkill = selectedSkill?.tags.includes("mcp") || 
    (selectedSkill?.sourceUrl && selectedSkill.sourceUrl.includes("localhost"));

  // Validate required parameters
  const validateParams = (): string[] => {
    if (!selectedSkill) return [];
    const errors: string[] = [];
    for (const param of selectedSkill.parameters) {
      if (param.required && !params[param.name]) {
        errors.push(`${param.name} is required`);
      }
    }
    return errors;
  };

  const handleRun = async () => {
    if (!selectedSkill) return;

    const validationErrors = validateParams();
    if (validationErrors.length > 0) {
      setOutput(JSON.stringify({
        success: false,
        error: "Validation failed",
        details: validationErrors,
      }, null, 2));
      return;
    }

    setIsRunning(true);
    setOutput(null);

    const startTime = Date.now();

    try {
      let result: any;

      if (executionMode === "mcp" && mcpServerUrl) {
        // Try to execute via MCP protocol
        result = await executeMcpTool(mcpServerUrl, selectedSkill.name, params);
      } else {
        // Simulate execution
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));
        result = {
          success: true,
          mode: "simulated",
          skill: selectedSkill.name,
          version: selectedSkill.version,
          input: params,
          output: {
            message: `Simulated execution of ${selectedSkill.name}`,
            timestamp: new Date().toISOString(),
            note: "This is a simulated result. For real execution, connect to an MCP server.",
          },
        };
      }

      const duration = Date.now() - startTime;
      setExecutionTime(duration);

      const outputStr = JSON.stringify(result, null, 2);
      setOutput(outputStr);

      // Add to history
      setExecutionHistory((prev) => [
        {
          timestamp: new Date().toISOString(),
          skill: selectedSkill.name,
          params: { ...params },
          output: outputStr,
          duration,
        },
        ...prev.slice(0, 9), // Keep last 10 executions
      ]);
    } catch (error) {
      setOutput(JSON.stringify({
        success: false,
        error: String(error),
      }, null, 2));
      setExecutionTime(Date.now() - startTime);
    }

    setIsRunning(false);
  };

  // Execute tool via MCP protocol
  const executeMcpTool = async (
    serverUrl: string,
    toolName: string,
    toolParams: Record<string, string>
  ): Promise<any> => {
    const requestBody = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolParams,
      },
    };

    const response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`MCP server error: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error.message || "MCP execution failed");
    }

    return {
      success: true,
      mode: "mcp",
      skill: toolName,
      input: toolParams,
      output: result.result,
    };
  };

  const handleCopyOutput = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleReset = () => {
    setParams({});
    setOutput(null);
    setExecutionTime(null);
  };

  const handleSelectSkill = (skill: Skill) => {
    setSelectedSkillHash(skill.hash);
    setShowSkillSelector(false);
    setParams({});
    setOutput(null);
    setExecutionTime(null);
  };

  return (
    <div className="flex h-full">
      {/* Left panel: Skill selection and parameters */}
      <div className="w-96 border-r border-border-default bg-bg-secondary p-4">
        {/* Skill selector */}
        <div className="mb-4">
          <label className="text-xs text-text-muted mb-1.5 block">
            Select Skill
          </label>
          <div className="relative">
            <button
              className="flex w-full items-center justify-between rounded-md border border-border-default bg-bg-tertiary px-3 py-2 text-sm text-text-primary hover:bg-bg-elevated"
              onClick={() => setShowSkillSelector(!showSkillSelector)}
            >
              <span className={selectedSkill ? "" : "text-text-muted"}>
                {selectedSkill?.name || "Choose a skill to debug..."}
              </span>
              <ChevronDown className="h-4 w-4 text-text-muted" />
            </button>

            {showSkillSelector && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-64 overflow-auto rounded-md border border-border-default bg-bg-secondary shadow-lg">
                {skills.length === 0 ? (
                  <div className="p-3 text-xs text-text-muted text-center">
                    No skills available
                  </div>
                ) : (
                  skills.map((skill) => (
                    <button
                      key={skill.hash}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg-tertiary",
                        selectedSkillHash === skill.hash && "bg-bg-tertiary"
                      )}
                      onClick={() => handleSelectSkill(skill)}
                    >
                      <div>
                        <div className="text-text-primary">{skill.name}</div>
                        <div className="text-xs text-text-muted">v{skill.version}</div>
                      </div>
                      {skill.permissions.some((p) => getPermissionLevel(p) === "high") && (
                        <AlertTriangle className="h-4 w-4 text-permission-high" />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {selectedSkill ? (
          <div className="space-y-4">
            {/* Skill info */}
            <div className="rounded-md border border-border-default bg-bg-tertiary p-3">
              <div className="text-sm font-medium text-text-primary">
                {selectedSkill.name}
              </div>
              <div className="text-xs text-text-muted mt-1">
                {selectedSkill.description}
              </div>
              {selectedSkill.permissions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedSkill.permissions.map((permission) => {
                    const level = getPermissionLevel(permission);
                    return (
                      <Badge key={permission} variant={level} className="text-[10px]">
                        {permission}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            {/* High risk warning */}
            {hasHighRiskPermissions && (
              <div className="flex items-start gap-2 rounded-md border border-permission-high/50 bg-permission-high/10 p-3">
                <AlertTriangle className="h-4 w-4 text-permission-high shrink-0 mt-0.5" />
                <p className="text-xs text-permission-high">
                  This skill has high-risk permissions. Be careful when executing.
                </p>
              </div>
            )}

            {/* Execution mode selector */}
            <div>
              <h3 className="text-xs font-medium text-text-muted mb-2">
                Execution Mode
              </h3>
              <div className="flex gap-2">
                <Button
                  variant={executionMode === "simulate" ? "default" : "secondary"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setExecutionMode("simulate")}
                >
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Simulate
                </Button>
                <Button
                  variant={executionMode === "mcp" ? "default" : "secondary"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setExecutionMode("mcp")}
                >
                  <Server className="h-3.5 w-3.5 mr-1.5" />
                  MCP
                </Button>
              </div>
              {executionMode === "mcp" && (
                <div className="mt-2">
                  <Input
                    placeholder="MCP Server URL (e.g., http://localhost:3000)"
                    value={mcpServerUrl}
                    onChange={(e) => setMcpServerUrl(e.target.value)}
                    className="text-xs"
                  />
                  {isMcpSkill && selectedSkill?.sourceUrl && (
                    <button
                      className="text-xs text-accent-blue mt-1 hover:underline"
                      onClick={() => setMcpServerUrl(selectedSkill.sourceUrl || "")}
                    >
                      Use skill's source URL
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Parameters */}
            {selectedSkill.parameters.length > 0 ? (
              <div>
                <h3 className="text-xs font-medium text-text-muted mb-3">
                  Parameters
                </h3>
                {selectedSkill.parameters.map((param) => (
                  <div key={param.name} className="mb-3">
                    <label className="flex items-center gap-2 text-xs text-text-primary mb-1.5">
                      {param.name}
                      <span className="text-text-muted">({param.type})</span>
                      {param.required && (
                        <span className="text-accent-red">*</span>
                      )}
                    </label>
                    <Input
                      placeholder={param.description}
                      value={params[param.name] || ""}
                      onChange={(e) =>
                        setParams((prev) => ({
                          ...prev,
                          [param.name]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-text-muted">
                This skill has no parameters.
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Reset
              </Button>
              <Button
                className="flex-1"
                onClick={handleRun}
                disabled={isRunning || (executionMode === "mcp" && !mcpServerUrl)}
              >
                {isRunning ? (
                  <>
                    <div className="h-4 w-4 mr-1.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1.5" />
                    {executionMode === "mcp" ? "Execute via MCP" : "Simulate"}
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-text-muted">
            <Play className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">Select a skill to debug</p>
          </div>
        )}
      </div>

      {/* Right panel: Output */}
      <div className="flex-1 flex flex-col">
        {/* Output header */}
        <div className="flex items-center justify-between border-b border-border-default px-4 py-2">
          <h3 className="text-sm font-medium text-text-primary">
            Execution Result
          </h3>
          <div className="flex items-center gap-3">
            {executionTime !== null && (
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Clock className="h-3.5 w-3.5" />
                <span>{executionTime}ms</span>
              </div>
            )}
            {output && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopyOutput}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-accent-green" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Output content */}
        <ScrollArea className="flex-1 p-4">
          {output ? (
            <pre className="text-xs text-text-primary font-mono whitespace-pre-wrap bg-bg-tertiary rounded-lg p-4">
              {output}
            </pre>
          ) : (
            <div className="flex h-full items-center justify-center text-text-muted">
              <div className="text-center">
                <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">No output yet</p>
                <p className="text-xs mt-1">
                  Select a skill, fill in the parameters, and click Execute
                </p>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Execution history */}
        {executionHistory.length > 0 && (
          <div className="border-t border-border-default">
            <div className="px-4 py-2 border-b border-border-muted flex items-center justify-between">
              <h4 className="text-xs font-medium text-text-muted">Execution History</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setExecutionHistory([])}
              >
                Clear
              </Button>
            </div>
            <ScrollArea className="h-32">
              <div className="divide-y divide-border-muted">
                {executionHistory.map((entry, index) => (
                  <button
                    key={index}
                    className="w-full px-4 py-2 text-left hover:bg-bg-tertiary"
                    onClick={() => setOutput(entry.output)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-text-primary">
                        {entry.skill}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {entry.duration}ms
                      </span>
                    </div>
                    <div className="text-[10px] text-text-muted">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Skill content preview */}
        {skillContent && (
          <div className="border-t border-border-default">
            <div className="px-4 py-2 border-b border-border-muted">
              <h4 className="text-xs font-medium text-text-muted">Source Preview</h4>
            </div>
            <ScrollArea className="h-48 p-4">
              <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap">
                {skillContent}
              </pre>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
};
