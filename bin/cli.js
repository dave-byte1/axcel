#!/usr/bin/env node

const {Command} = require('commander');
const program = new Command();
const path = require('path');
const fs = require('fs');

const scanner = require('../lib/scanner');
const suggestions = require('../lib/suggestions');

program
    .name('axcel')
    .description('An AI-powered Web Accessibility Scanning tool which scans HTML and CSS files for accessibility issues and provides AI suggestions to improve accessibility.')
    .version('1.0.0');

program
    .command('scan')
    .description('Scan HTML and CSS files for accessibility issues')
    .argument('<input>', 'Path to the HTML/CSS file or directory')
    .option('-r, --report <type>', 'Specify report format (json, html)', 'table')
    .option('-o, --output <file>', 'Save report to a file instead of displaying in terminal')
    .option('-a, --ai', 'Enable AI-driven accessibility suggestions')
    .action(async (input, options) => {
        try {
            if (!fs.existsSync(input)) {
                console.error(`Error: The Specified path "${input}" does not exist.`);
                process.exit(1);
            }

            const stats = fs.statSync(input);
            let results = [];

            // Asynchronous recursive function to walk through directories and scan files
            const walkDirectory = async (dir) => {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const fullPath = path.join(dir, file);
                    const fileStats = fs.statSync(fullPath);
                    if (fileStats.isDirectory()) {
                        await walkDirectory(fullPath);
                    } else if (['.html', '.css'].includes(path.extname(fullPath))) {
                        console.log(`Scanning file: ${fullPath}`);
                        const report = await scanner.scan(fullPath);
                        results.push({file: fullPath, report});
                    }
                }
            };

            // Scan a single file or directory
            if (stats.isFile()) {
                console.log(`Scanning file: ${input}`);
                try {
                    const report = await scanner.scan(input);
                    results.push({file: input, report});
                } catch (error) {
                    const errorReport = handleScanError(error, input);
                    results.push({file: input, report: errorReport});
                }
            } else if (stats.isDirectory()) {
                console.log(`Scanning directory: ${input}`);

                // Modified walkDirectory function with error handling
                const walkDirectory = async (dir) => {
                    const files = fs.readdirSync(dir);
                    for (const file of files) {
                        const fullPath = path.join(dir, file);
                        const fileStats = fs.statSync(fullPath);
                        if (fileStats.isDirectory()) {
                            await walkDirectory(fullPath);
                        } else if (['.html', '.css'].includes(path.extname(fullPath))) {
                            console.log(`Scanning file: ${fullPath}`);
                            try {
                                const report = await scanner.scan(fullPath);
                                results.push({file: fullPath, report});
                            } catch (error) {
                                const errorReport = handleScanError(error, fullPath);
                                results.push({file: fullPath, report: errorReport});
                            }
                        }
                    }
                };

                await walkDirectory(input);
            }

            // If AI suggestions are enabled, add them to the report
            if (options.ai) {
                console.log("Generating AI-driven accessibility suggestions...");
                for (let result of results) {
                    const aiSuggestions = await suggestions.processReport(result.report);
                    result.aiSuggestions = aiSuggestions;
                }
            }

            // Process results for output
            const outputResults = results.map(result => {
                const output = {
                    file: result.file,
                    issues: result.report.issues || []
                };

                if (result.aiSuggestions) {
                    output.aiSuggestions = result.aiSuggestions;
                }

                return output;
            });

            // Generate the appropriate output based on the chosen format
            let outputContent = '';

            if (options.report === 'json') {
                outputContent = JSON.stringify(outputResults, null, 2);
            } else if (options.report === 'html') {
                outputContent = generateHTMLReport(outputResults);
            } else if (options.report === 'table') {
                // Default to table format for terminal output
                printTableReport(outputResults);
                return; // Exit after printing to terminal
            } else {
                console.error("Error: Unsupported report format. Please use 'table', 'json', or 'html'.");
                process.exit(1);
            }

            // Output to file if specified, otherwise to console
            if (options.output) {
                fs.writeFileSync(options.output, outputContent);
                console.log(`Report saved to ${options.output}`);
            } else {
                console.log(outputContent);
            }
        } catch (error) {
            console.error("An error occurred during scanning:", error);
            process.exit(1);
        }
    });

// Generates an HTML report from scan results
function generateHTMLReport(results) {
    return `
        <html>
            <head>
                <title>Accessibility Scan Report</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
                    h1, h2, h3, h4 { color: #333; margin-top: 1.5em; }
                    .file { margin-bottom: 30px; border: 1px solid #ddd; padding: 20px; border-radius: 5px; }
                    .issue { margin-bottom: 25px; border-left: 4px solid #e74c3c; padding-left: 15px; }
                    .suggestion { margin-top: 15px; border-left: 4px solid #3498db; padding-left: 15px; }
                    pre { background: #f8f8f8; padding: 15px; border-radius: 5px; overflow: auto; font-family: monospace; white-space: pre; margin: 10px 0; }
                    .impact-critical { color: #e74c3c; }
                    .impact-serious { color: #e67e22; }
                    .impact-moderate { color: #f39c12; }
                    .impact-minor { color: #2ecc71; }
                </style>
            </head>
            <body>
                <h1>Accessibility Scan Report</h1>
                ${results.map(result => `
                    <div class="file">
                        <h2>File: ${result.file}</h2>
                        <h3>Issues:</h3>
                        ${result.issues.length === 0 ? '<p>No issues found!</p>' : result.issues.map(issue => {
        if (issue.id) {
            // HTML issue
            return `
                                <div class="issue">
                                    <h4 class="impact-${issue.impact || 'moderate'}">${escapeHTML(issue.id)}: ${escapeHTML(issue.description || '')}</h4>
                                    <p>${escapeHTML(issue.help || '')}</p>
                                    ${issue.nodes && issue.nodes[0] ? `<pre>${escapeHTML(issue.nodes[0].html)}</pre>` : ''}
                                    
                                    ${result.aiSuggestions && result.aiSuggestions.html ?
                result.aiSuggestions.html
                    .filter(s => s.ruleId === issue.id)
                    .map(suggestion => `
                                          <div class="suggestion">
                                              <h4>Suggestion:</h4>
                                              <p>${escapeHTML(suggestion.suggestion)}</p>
                                              <pre>${escapeHTML(suggestion.codeFix)}</pre>
                                          </div>
                                        `).join('') : ''}
                                </div>`;
        } else if (issue.selector) {
            // CSS issue
            return `
                                <div class="issue">
                                    <h4 class="impact-moderate">${escapeHTML(issue.selector)}:</h4>
                                    ${issue.issues ? issue.issues.map(cssIssue => `
                                    <p>${escapeHTML(cssIssue.message)}</p>
                                    `).join('') : ''}
                                    
                                    ${result.aiSuggestions && result.aiSuggestions.css ?
                result.aiSuggestions.css
                    .filter(s => s.selector === issue.selector)
                    .map(suggestion => `
                                        <div class="suggestion">
                                            <h4>Suggestion:</h4>
                                            <p>${escapeHTML(suggestion.suggestion)}</p>
                                            <pre>${escapeHTML(suggestion.codeFix)}</pre>
                                        </div>
                                        `).join('') : ''}
                                </div>`;
        }
    }).join('')}
                    </div>
                `).join('')}
            </body>
        </html>
    `;
}

function escapeHTML(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Prints a formatted table report to the console
function printTableReport(results) {
    // Get terminal width for better formatting
    let terminalWidth = process.stdout.columns || 120;
    terminalWidth = Math.min(terminalWidth, 140);

    const columnWidths = {
        file: Math.floor(terminalWidth * 0.15),
        issue: Math.floor(terminalWidth * 0.12),
        impact: Math.floor(terminalWidth * 0.08),
        description: Math.floor(terminalWidth * 0.32),
        suggestion: Math.floor(terminalWidth * 0.33)
    };

    // Get total width for separators (add 4 for the | separators)
    const totalWidth = Object.values(columnWidths).reduce((a, b) => a + b, 0) + 4;

    // Print table header
    console.log('\n' + '='.repeat(totalWidth));
    console.log('ACCESSIBILITY SCAN REPORT');
    console.log('='.repeat(totalWidth));

    // Function to wrap text to fit within column width
    const wrapText = (text, maxWidth) => {
        if (!text || text.length <= maxWidth) return [text || ''];

        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        words.forEach(word => {
            if ((currentLine + ' ' + word).length <= maxWidth) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word.length > maxWidth ? word.substring(0, maxWidth - 3) + '...' : word;
            }
        });

        if (currentLine) lines.push(currentLine);
        return lines;
    };

    // Format a row with proper column widths
    const formatRow = (file, issue, impact, description, suggestion) => {
        const wrappedDesc = wrapText(description, columnWidths.description);
        const wrappedSuggestion = wrapText(suggestion, columnWidths.suggestion);

        // Calculate the maximum number of lines needed
        const maxLines = Math.max(1, wrappedDesc.length, wrappedSuggestion.length);

        if (maxLines === 1) {
            return [
                file.substring(0, columnWidths.file).padEnd(columnWidths.file),
                issue.substring(0, columnWidths.issue).padEnd(columnWidths.issue),
                impact.substring(0, columnWidths.impact).padEnd(columnWidths.impact),
                description.substring(0, columnWidths.description).padEnd(columnWidths.description),
                suggestion.substring(0, columnWidths.suggestion).padEnd(columnWidths.suggestion)
            ].join('|');
        } else {
            // Multiple lines case
            const lines = [];
            for (let i = 0; i < maxLines; i++) {
                const line = [
                    i === 0 ? file.substring(0, columnWidths.file).padEnd(columnWidths.file) : ''.padEnd(columnWidths.file),
                    i === 0 ? issue.substring(0, columnWidths.issue).padEnd(columnWidths.issue) : ''.padEnd(columnWidths.issue),
                    i === 0 ? impact.substring(0, columnWidths.impact).padEnd(columnWidths.impact) : ''.padEnd(columnWidths.impact),
                    (wrappedDesc[i] || '').padEnd(columnWidths.description),
                    (wrappedSuggestion[i] || '').padEnd(columnWidths.suggestion)
                ].join('|');
                lines.push(line);
            }
            return lines.join('\n');
        }
    };

    // Print column headers
    console.log(formatRow('FILE', 'ISSUE', 'IMPACT', 'DESCRIPTION', 'SUGGESTION'));
    console.log('-'.repeat(totalWidth));

    // For each result file
    results.forEach(result => {
        const fileName = path.basename(result.file);

        // Process HTML issues
        if (result.issues && Array.isArray(result.issues)) {
            result.issues.forEach(issue => {
                // Handle regular issues (HTML)
                if (issue.id) {
                    const issueName = issue.id;
                    const impact = issue.impact || 'N/A';
                    const description = issue.description || issue.help || 'No description';

                    // Find matching suggestion if AI is enabled
                    let suggestion = 'No AI suggestion available';
                    if (result.aiSuggestions && result.aiSuggestions.html) {
                        const matchingSuggestion = result.aiSuggestions.html.find(s => s.ruleId === issue.id);
                        if (matchingSuggestion) {
                            suggestion = matchingSuggestion.suggestion;
                        }
                    }

                    console.log(formatRow(fileName, issueName, impact, description, suggestion));

                    // If there are nodes affected, print them indented
                    if (issue.nodes && issue.nodes.length > 0) {
                        console.log(`    Affected element: ${issue.nodes[0].html.substring(0, Math.min(totalWidth - 20, 100))}${issue.nodes[0].html.length > Math.min(totalWidth - 20, 100) ? '...' : ''}`);

                        // Print code fix if available
                        if (result.aiSuggestions && result.aiSuggestions.html) {
                            const matchingSuggestion = result.aiSuggestions.html.find(s => s.ruleId === issue.id);
                            if (matchingSuggestion && matchingSuggestion.codeFix) {
                                const codeFixLines = matchingSuggestion.codeFix.split('\n');
                                if (codeFixLines.length === 1 || codeFixLines.length === 2) {
                                    console.log(`    Suggested fix: ${matchingSuggestion.codeFix.substring(0, Math.min(totalWidth - 20, 120))}${matchingSuggestion.codeFix.length > Math.min(totalWidth - 20, 120) ? '...' : ''}`);
                                } else {
                                    // For longer fixes, show on multiple lines with limited width
                                    console.log(`    Suggested fix:`);
                                    codeFixLines.slice(0, 4).forEach(line => {
                                        console.log(`      ${line.substring(0, Math.min(totalWidth - 6, 100))}`);
                                    });
                                    if (codeFixLines.length > 4) {
                                        console.log(`      ...`);
                                    }
                                }
                            }
                        }

                        console.log('-'.repeat(totalWidth));
                    }
                }
                // Handle CSS issues
                else if (issue.selector) {
                    issue.issues.forEach(cssIssue => {
                        const issueName = cssIssue.type;
                        const impact = 'N/A';
                        const description = cssIssue.message || 'No description';

                        // Find matching suggestion if AI is enabled
                        let suggestion = 'No AI suggestion available';
                        if (result.aiSuggestions && result.aiSuggestions.css) {
                            const matchingSuggestion = result.aiSuggestions.css.find(s =>
                                s.selector === issue.selector && s.type === cssIssue.type);
                            if (matchingSuggestion) {
                                suggestion = matchingSuggestion.suggestion;
                            }
                        }

                        console.log(formatRow(fileName, issueName, impact, description, suggestion));

                        // Print the selector and declaration
                        console.log(`    Selector: ${issue.selector}`);
                        if (cssIssue.declaration) {
                            console.log(`    Declaration: ${cssIssue.declaration}`);
                        } else if (cssIssue.declarations) {
                            Object.entries(cssIssue.declarations).forEach(([prop, value]) => {
                                console.log(`    ${prop}: ${value}`);
                            });
                        }

                        // Print code fix if available
                        if (result.aiSuggestions && result.aiSuggestions.css) {
                            const matchingSuggestion = result.aiSuggestions.css.find(s =>
                                s.selector === issue.selector && s.type === cssIssue.type);
                            if (matchingSuggestion && matchingSuggestion.codeFix) {
                                const codeFixLines = matchingSuggestion.codeFix.split('\n');
                                if (codeFixLines.length <= 2) {
                                    // For short fixes, show on a single line
                                    const codeFix = matchingSuggestion.codeFix.replace(/\n/g, ' ').substring(0, Math.min(totalWidth - 20, 120));
                                    console.log(`    Suggested fix: ${codeFix}${matchingSuggestion.codeFix.length > Math.min(totalWidth - 20, 120) ? '...' : ''}`);
                                } else {
                                    // For longer fixes, show on multiple lines
                                    console.log(`    Suggested fix:`);
                                    codeFixLines.slice(0, 4).forEach(line => {
                                        console.log(`      ${line.substring(0, Math.min(totalWidth - 6, 100))}`);
                                    });
                                    if (codeFixLines.length > 4) {
                                        console.log(`      ...`);
                                    }
                                }
                            }
                        }

                        console.log('-'.repeat(totalWidth));
                    });
                }
            });
        }
    });

    console.log('\nScan complete. Use --report=json or --report=html with --output=filename.ext to save full reports with AI suggestions.');
}

// Handles errors during the scanning process
function handleScanError(error, filePath) {
    console.error(`Warning: Error scanning ${filePath}: ${error.message}`);

    // Create a minimal report object with error information
    return {
        file: filePath,
        type: path.extname(filePath).toLowerCase() === '.html' ? 'html' : 'css',
        issues: [],
        error: error.message
    };
}

program.parse(process.argv);