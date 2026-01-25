use std::collections::HashSet;
use std::path::Path;

/// Risk level for detected patterns
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

/// A detected risk pattern in code
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedRisk {
    /// Risk category (e.g., "file_delete", "network_upload", etc.)
    pub category: String,
    /// Human-readable description
    pub description: String,
    /// Risk level
    pub level: RiskLevel,
    /// Line number where detected (1-based)
    pub line: Option<usize>,
    /// The matched pattern/code snippet
    pub pattern: String,
}

/// Result of risk analysis
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskAnalysis {
    /// Overall risk level (highest of all detected risks)
    pub overall_level: Option<RiskLevel>,
    /// List of detected risks
    pub detected_risks: Vec<DetectedRisk>,
    /// Whether the file contains executable code
    pub is_executable_code: bool,
    /// File extension
    pub file_extension: Option<String>,
}

/// Code file extensions that should be scanned
const EXECUTABLE_EXTENSIONS: &[&str] = &[
    "py", "python",           // Python
    "js", "mjs", "cjs",       // JavaScript
    "ts", "mts", "cts",       // TypeScript
    "sh", "bash", "zsh",      // Shell scripts
    "rb",                     // Ruby
    "pl", "pm",               // Perl
    "php",                    // PHP
    "lua",                    // Lua
    "ps1", "psm1",            // PowerShell
    "bat", "cmd",             // Windows batch
    "go",                     // Go
    "rs",                     // Rust
    "java",                   // Java
    "kt", "kts",              // Kotlin
    "swift",                  // Swift
    "c", "cpp", "cc", "cxx",  // C/C++
    "cs",                     // C#
];

/// Risk patterns for different languages
struct RiskPattern {
    category: &'static str,
    description: &'static str,
    level: RiskLevel,
    patterns: &'static [&'static str],
}

/// High-risk patterns - file deletion, system modification
const HIGH_RISK_PATTERNS: &[RiskPattern] = &[
    RiskPattern {
        category: "file_delete",
        description: "File/directory deletion operation",
        level: RiskLevel::High,
        patterns: &[
            // Python
            "os.remove(", "os.unlink(", "os.rmdir(", "shutil.rmtree(",
            "pathlib.Path.unlink(", "Path.unlink(", ".unlink(",
            // JavaScript/Node.js
            "fs.unlink(", "fs.unlinkSync(", "fs.rm(", "fs.rmSync(",
            "fs.rmdir(", "fs.rmdirSync(", "rimraf(",
            "fsPromises.unlink(", "fsPromises.rm(", "fsPromises.rmdir(",
            // Shell
            "rm -rf", "rm -r", "rmdir", "del /f", "del /s",
            // Ruby
            "FileUtils.rm", "FileUtils.rm_rf", "File.delete(",
            // Go
            "os.Remove(", "os.RemoveAll(",
            // Rust
            "std::fs::remove_file(", "std::fs::remove_dir(",
            "fs::remove_file(", "fs::remove_dir(",
        ],
    },
    RiskPattern {
        category: "shell_exec",
        description: "Shell command execution",
        level: RiskLevel::High,
        patterns: &[
            // Python
            "os.system(", "subprocess.call(", "subprocess.run(",
            "subprocess.Popen(", "os.popen(", "commands.getoutput(",
            "exec(", "eval(",
            // JavaScript/Node.js
            "child_process.exec(", "child_process.spawn(",
            "child_process.execSync(", "child_process.spawnSync(",
            "execSync(", "spawnSync(",
            // Shell
            "eval ", "$(", "`",
            // Ruby
            "system(", "exec(", "spawn(", "`",
            // PHP
            "shell_exec(", "exec(", "system(", "passthru(",
        ],
    },
    RiskPattern {
        category: "privilege_escalation",
        description: "Privilege escalation attempt",
        level: RiskLevel::High,
        patterns: &[
            "sudo ", "su ", "chmod 777", "chmod +x",
            "setuid", "setgid", "chown root",
            "runas /user:", "Start-Process.*-Verb RunAs",
        ],
    },
];

/// Medium-risk patterns - network operations, file write
const MEDIUM_RISK_PATTERNS: &[RiskPattern] = &[
    RiskPattern {
        category: "network_upload",
        description: "Network upload/POST operation",
        level: RiskLevel::Medium,
        patterns: &[
            // HTTP POST/PUT (data upload)
            "requests.post(", "requests.put(", "requests.patch(",
            "httpx.post(", "httpx.put(",
            "urllib.request.urlopen(", "urllib.request.Request(",
            // JavaScript/Node.js
            "fetch(", ".post(", ".put(", ".patch(",
            "axios.post(", "axios.put(",
            "http.request(", "https.request(",
            // cURL
            "curl -X POST", "curl -X PUT", "curl --data", "curl -d ",
            // WebSocket
            "WebSocket(", "ws.send(", "socket.send(",
        ],
    },
    RiskPattern {
        category: "network_download",
        description: "Network download/GET operation",
        level: RiskLevel::Medium,
        patterns: &[
            // Python
            "requests.get(", "urllib.request.urlretrieve(",
            "httpx.get(", "aiohttp.get(",
            // JavaScript/Node.js
            "axios.get(", "http.get(", "https.get(",
            // cURL/wget
            "curl ", "wget ",
        ],
    },
    RiskPattern {
        category: "file_write",
        description: "File write operation",
        level: RiskLevel::Medium,
        patterns: &[
            // Python
            "open(", "with open(", ".write(", ".writelines(",
            "pathlib.Path.write_", "Path.write_",
            // JavaScript/Node.js
            "fs.writeFile(", "fs.writeFileSync(",
            "fs.appendFile(", "fs.appendFileSync(",
            "fsPromises.writeFile(", "fsPromises.appendFile(",
            // Shell
            "> ", ">> ", "tee ",
        ],
    },
    RiskPattern {
        category: "environment_access",
        description: "Environment variable access",
        level: RiskLevel::Medium,
        patterns: &[
            // Python
            "os.environ", "os.getenv(",
            // JavaScript/Node.js
            "process.env",
            // Shell
            "$ENV", "${ENV", "export ",
        ],
    },
];

/// Low-risk patterns - file read, system info
const LOW_RISK_PATTERNS: &[RiskPattern] = &[
    RiskPattern {
        category: "file_read",
        description: "File read operation",
        level: RiskLevel::Low,
        patterns: &[
            // Python
            ".read(", ".readline(", ".readlines(",
            "pathlib.Path.read_", "Path.read_",
            // JavaScript/Node.js
            "fs.readFile(", "fs.readFileSync(",
            "fsPromises.readFile(",
            // Shell
            "cat ", "head ", "tail ", "less ", "more ",
        ],
    },
    RiskPattern {
        category: "system_info",
        description: "System information access",
        level: RiskLevel::Low,
        patterns: &[
            // Python
            "platform.", "sys.platform", "os.uname(",
            "socket.gethostname(", "getpass.getuser(",
            // JavaScript/Node.js
            "os.platform(", "os.hostname(", "os.userInfo(",
            "process.platform", "process.arch",
        ],
    },
];

/// Check if a file extension indicates executable code
pub fn is_executable_extension(ext: &str) -> bool {
    let ext_lower = ext.to_lowercase();
    EXECUTABLE_EXTENSIONS.contains(&ext_lower.as_str())
}

/// Analyze a file for security risks
pub fn analyze_file(path: &Path, content: &str) -> RiskAnalysis {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());
    
    let is_executable = extension
        .as_ref()
        .map(|ext| is_executable_extension(ext))
        .unwrap_or(false);
    
    let mut analysis = RiskAnalysis {
        overall_level: None,
        detected_risks: Vec::new(),
        is_executable_code: is_executable,
        file_extension: extension,
    };
    
    // Only scan executable code files
    if !is_executable {
        return analysis;
    }
    
    // Scan for risk patterns
    let mut detected_categories: HashSet<String> = HashSet::new();
    
    for (line_num, line) in content.lines().enumerate() {
        let line_num = line_num + 1; // 1-based line numbers
        
        // Skip comments (basic detection)
        let trimmed = line.trim();
        if trimmed.starts_with('#') || trimmed.starts_with("//") || trimmed.starts_with("/*") {
            continue;
        }
        
        // Check high-risk patterns
        for pattern_group in HIGH_RISK_PATTERNS {
            for pattern in pattern_group.patterns {
                if line.contains(pattern) && !detected_categories.contains(&format!("{}:{}", pattern_group.category, line_num)) {
                    detected_categories.insert(format!("{}:{}", pattern_group.category, line_num));
                    analysis.detected_risks.push(DetectedRisk {
                        category: pattern_group.category.to_string(),
                        description: pattern_group.description.to_string(),
                        level: pattern_group.level,
                        line: Some(line_num),
                        pattern: pattern.to_string(),
                    });
                }
            }
        }
        
        // Check medium-risk patterns
        for pattern_group in MEDIUM_RISK_PATTERNS {
            for pattern in pattern_group.patterns {
                if line.contains(pattern) && !detected_categories.contains(&format!("{}:{}", pattern_group.category, line_num)) {
                    detected_categories.insert(format!("{}:{}", pattern_group.category, line_num));
                    analysis.detected_risks.push(DetectedRisk {
                        category: pattern_group.category.to_string(),
                        description: pattern_group.description.to_string(),
                        level: pattern_group.level,
                        line: Some(line_num),
                        pattern: pattern.to_string(),
                    });
                }
            }
        }
        
        // Check low-risk patterns
        for pattern_group in LOW_RISK_PATTERNS {
            for pattern in pattern_group.patterns {
                if line.contains(pattern) && !detected_categories.contains(&format!("{}:{}", pattern_group.category, line_num)) {
                    detected_categories.insert(format!("{}:{}", pattern_group.category, line_num));
                    analysis.detected_risks.push(DetectedRisk {
                        category: pattern_group.category.to_string(),
                        description: pattern_group.description.to_string(),
                        level: pattern_group.level,
                        line: Some(line_num),
                        pattern: pattern.to_string(),
                    });
                }
            }
        }
    }
    
    // Determine overall risk level
    analysis.overall_level = analysis.detected_risks.iter()
        .map(|r| r.level)
        .max_by(|a, b| {
            let order = |l: &RiskLevel| match l {
                RiskLevel::Low => 0,
                RiskLevel::Medium => 1,
                RiskLevel::High => 2,
            };
            order(a).cmp(&order(b))
        });
    
    analysis
}

/// Analyze content string directly (for preview)
pub fn analyze_content(content: &str, extension: Option<&str>) -> RiskAnalysis {
    let is_executable = extension
        .map(|ext| is_executable_extension(ext))
        .unwrap_or(false);
    
    if !is_executable {
        return RiskAnalysis {
            overall_level: None,
            detected_risks: Vec::new(),
            is_executable_code: false,
            file_extension: extension.map(|s| s.to_string()),
        };
    }
    
    // Use a dummy path for analysis
    let dummy_path = std::path::PathBuf::from(format!("file.{}", extension.unwrap_or("txt")));
    analyze_file(&dummy_path, content)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_python_file_delete() {
        let content = r#"
import os
import shutil

def cleanup():
    os.remove("/tmp/test.txt")
    shutil.rmtree("/tmp/test_dir")
"#;
        let analysis = analyze_content(content, Some("py"));
        assert!(analysis.is_executable_code);
        assert!(analysis.detected_risks.iter().any(|r| r.category == "file_delete"));
        assert_eq!(analysis.overall_level, Some(RiskLevel::High));
    }
    
    #[test]
    fn test_js_network_upload() {
        let content = r#"
const axios = require('axios');

async function uploadData(data) {
    await axios.post('https://api.example.com/upload', data);
}
"#;
        let analysis = analyze_content(content, Some("js"));
        assert!(analysis.is_executable_code);
        assert!(analysis.detected_risks.iter().any(|r| r.category == "network_upload"));
        assert_eq!(analysis.overall_level, Some(RiskLevel::Medium));
    }
    
    #[test]
    fn test_shell_exec() {
        let content = r#"
import subprocess
result = subprocess.run(['ls', '-la'], capture_output=True)
"#;
        let analysis = analyze_content(content, Some("py"));
        assert!(analysis.detected_risks.iter().any(|r| r.category == "shell_exec"));
        assert_eq!(analysis.overall_level, Some(RiskLevel::High));
    }
    
    #[test]
    fn test_non_executable_file() {
        let content = "# This is just a markdown file\n\nos.remove() is mentioned but not executed";
        let analysis = analyze_content(content, Some("md"));
        assert!(!analysis.is_executable_code);
        assert!(analysis.detected_risks.is_empty());
    }
}
