const fs = require('fs');
const path = require('path');
const {GoogleGenerativeAI} = require('@google/generative-ai');

// Process an accessibility report and generate AI-driven suggestions for fixing issues
async function processReport(report) {
    const suggestions = {};

    // Check if API key is set
    if (!process.env.GEMINI_API_KEY) {
        console.warn("Warning: GEMINI_API_KEY environment variable not set. Defaulting to rule-based suggestions.");
        return generateRuleBasedSuggestions(report);
    }

    try {
        // Initialize the Gemini API
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({model: "gemini-1.5-flash"});

        // Process HTML issues
        if (report.type === 'html' && Array.isArray(report.issues)) {
            suggestions.html = await processHTMLIssues(report.issues, report.file, model);
        }
        // Process CSS issues
        else if (report.type === 'css' && Array.isArray(report.issues)) {
            suggestions.css = await processCSSIssues(report.issues, report.file, model);
        }

        return suggestions;
    } catch (error) {
        console.error("Error generating suggestions:", error);
        return generateRuleBasedSuggestions(report);
    }
}

// Process HTML accessibility issues and generate suggestions using Gemini
async function processHTMLIssues(issues, filePath, model) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const suggestions = [];

    for (const issue of issues) {
        // Extract relevant information for the prompt
        const ruleId = issue.id;
        const impact = issue.impact;
        const description = issue.description;
        const help = issue.help;
        const helpUrl = issue.helpUrl || '';

        // Create context for specific nodes
        const nodeExamples = issue.nodes.slice(0, 2).map(node => {
            return {
                html: node.html,
                target: node.target?.join(' ') || '',
                failureSummary: node.failureSummary || ''
            };
        });

        // Create prompt for Gemini
        const prompt = `You are an accessibility expert helping to fix accessibility issues in HTML code.

Issue details:
- Rule: ${ruleId}
- Impact: ${impact}
- Description: ${description}
- Help: ${help}
- Help URL: ${helpUrl}

Example problematic code:
${nodeExamples.map(n => n.html).join('\n\n')}

Failure summary:
${nodeExamples.map(n => n.failureSummary).join('\n\n')}

Please provide:
1. A concise suggestion (1-2 sentences) explaining how to fix this accessibility issue.
2. A code snippet showing the fixed version of the provided example.

Format your response strictly as follows:
SUGGESTION: [Your suggestion text here]
CODE: [Your code fix here]`;

        try {
            // Generate content with Gemini
            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            const {suggestion, codeFix} = parseGeminiResponse(text);

            suggestions.push({
                ruleId,
                impact,
                description,
                suggestion,
                codeFix,
                nodes: nodeExamples.map(n => n.html)
            });
        } catch (error) {
            console.error(`Error generating suggestion for rule ${ruleId}:`, error);

            // Fall back to rule-based suggestion
            const {suggestion, codeFix} = getHTMLSuggestionByRule(ruleId, nodeExamples);
            suggestions.push({
                ruleId,
                impact,
                description,
                suggestion,
                codeFix,
                nodes: nodeExamples.map(n => n.html)
            });
        }
    }

    return suggestions;
}

//Process CSS accessibility issues and generate suggestions using Gemini
async function processCSSIssues(issues, filePath, model) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const suggestions = [];

    for (const issue of issues) {
        const selector = issue.selector;

        for (const cssIssue of issue.issues) {
            const type = cssIssue.type;
            const message = cssIssue.message;

            // Determine what to include as the problematic code
            let problematicCode = '';
            if (cssIssue.declaration) {
                problematicCode = `${selector} {\n  ${cssIssue.declaration};\n}`;
            } else if (cssIssue.declarations) {
                problematicCode = `${selector} {\n${Object.entries(cssIssue.declarations)
                    .map(([prop, value]) => `  ${prop}: ${value};`)
                    .join('\n')}\n}`;
            }

            // Create prompt for Gemini
            const prompt = `You are an accessibility expert helping to fix accessibility issues in CSS code.

Issue details:
- Type: ${type}
- Message: ${message}

Problematic CSS code:
\`\`\`css
${problematicCode}
\`\`\`

Please provide:
1. A concise suggestion (1-2 sentences) explaining how to fix this accessibility issue.
2. A code snippet showing the fixed version of the CSS code.

Format your response strictly as follows:
SUGGESTION: [Your suggestion text here]
CODE: [Your code fix here]`;

            try {
                // Generate content with Gemini
                const result = await model.generateContent(prompt);
                const response = result.response;
                const text = response.text();

                // Parse the response to extract suggestion and code fix
                const {suggestion, codeFix} = parseGeminiResponse(text);

                suggestions.push({
                    selector,
                    type,
                    message,
                    suggestion,
                    codeFix,
                    originalCode: problematicCode
                });
            } catch (error) {
                console.error(`Error generating suggestion for CSS issue ${type}:`, error);

                // Fall back to rule-based suggestion
                const {suggestion, codeFix} = getCSSSuggestionByType(type, selector, cssIssue, problematicCode);
                suggestions.push({
                    selector,
                    type,
                    message,
                    suggestion,
                    codeFix,
                    originalCode: problematicCode
                });
            }
        }
    }

    return suggestions;
}

// Parse the Gemini response to extract suggestion and code fix
function parseGeminiResponse(response) {
    let suggestion = '';
    let codeFix = '';

    // Extract suggestion
    const suggestionMatch = response.match(/SUGGESTION:\s*(.*?)(?=CODE:|$)/s);
    if (suggestionMatch && suggestionMatch[1]) {
        suggestion = suggestionMatch[1].trim();
    }

    // Extract code
    const codeMatch = response.match(/CODE:\s*([\s\S]*?)$/s);
    if (codeMatch && codeMatch[1]) {
        codeFix = codeMatch[1].trim();

        codeFix = codeFix.replace(/```(?:html|css)?\s*/g, '').replace(/```$/g, '').trim();
    }

    return {suggestion, codeFix};
}

// Generate rule-based suggestions without using generative AI
function generateRuleBasedSuggestions(report) {
    const suggestions = {};

    // Process HTML issues
    if (report.type === 'html' && Array.isArray(report.issues)) {
        suggestions.html = report.issues.map(issue => {
            const nodeExamples = issue.nodes?.slice(0, 2).map(node => ({
                html: node.html,
                target: node.target?.join(' ') || '',
                failureSummary: node.failureSummary || ''
            })) || [];

            const {suggestion, codeFix} = getHTMLSuggestionByRule(issue.id, nodeExamples);

            return {
                ruleId: issue.id,
                impact: issue.impact,
                description: issue.description,
                suggestion,
                codeFix,
                nodes: nodeExamples.map(n => n.html)
            };
        });
    }
    // Process CSS issues
    else if (report.type === 'css' && Array.isArray(report.issues)) {
        suggestions.css = [];
        for (const issue of report.issues) {
            const selector = issue.selector;

            for (const cssIssue of issue.issues) {
                const type = cssIssue.type;
                const message = cssIssue.message;

                let problematicCode = '';
                if (cssIssue.declaration) {
                    problematicCode = `${selector} {\n  ${cssIssue.declaration};\n}`;
                } else if (cssIssue.declarations) {
                    problematicCode = `${selector} {\n${Object.entries(cssIssue.declarations)
                        .map(([prop, value]) => `  ${prop}: ${value};`)
                        .join('\n')}\n}`;
                }

                const {suggestion, codeFix} = getCSSSuggestionByType(type, selector, cssIssue, problematicCode);

                suggestions.css.push({
                    selector,
                    type,
                    message,
                    suggestion,
                    codeFix,
                    originalCode: problematicCode
                });
            }
        }
    }

    return suggestions;
}

// Get HTML suggestions based on axe-core rule ID

function getHTMLSuggestionByRule(ruleId, nodes) {
    const exampleHTML = nodes[0]?.html || '';

    // Rule-based suggestions dictionary
    const ruleSuggestions = {
        'image-alt': {
            suggestion: "Add an alt attribute to images to provide text alternatives for screen readers.",
            codeFix: exampleHTML.replace(/<img([^>]*)>/g, '<img$1 alt="Descriptive text for this image">')
        },
        'button-name': {
            suggestion: "Provide a name for all button elements through text content, aria-label, or aria-labelledby.",
            codeFix: exampleHTML.replace(/<button([^>]*)><\/button>/g, '<button$1>Button Label</button>')
                .replace(/<button([^>]*)>/g, (match, p1) => {
                    return p1.includes('aria-label') ? match : `<button${p1} aria-label="Button action">`;
                })
        },
        'color-contrast': {
            suggestion: "Ensure sufficient contrast between foreground and background colors (at least 4.5:1 for normal text).",
            codeFix: `<!-- Original: ${exampleHTML} -->\n<!-- Recommended: Increase the contrast ratio by using darker text or lighter background -->`
        },
        'label': {
            suggestion: "Associate form elements with labels using the 'for' attribute or nesting within label elements.",
            codeFix: exampleHTML.includes('for=') ?
                exampleHTML :
                exampleHTML.replace(/<input([^>]*)>/g, '<label>Label Text: <input$1></label>')
        },
        'link-name': {
            suggestion: "Provide accessible names for all links through text content, aria-label, or aria-labelledby.",
            codeFix: exampleHTML.replace(/<a([^>]*)><\/a>/g, '<a$1>Link Text</a>')
                .replace(/<a([^>]*)>/g, (match, p1) => {
                    return p1.includes('aria-label') ? match : `<a${p1} aria-label="Link destination">`;
                })
        },
        'heading-order': {
            suggestion: "Ensure heading levels are properly nested (h1, then h2, etc.) without skipping levels.",
            codeFix: `<!-- Original: ${exampleHTML} -->\n<!-- Review the document outline and adjust heading levels to be sequential -->`
        },
        'landmark': {
            suggestion: "Use ARIA landmark roles or HTML5 semantic elements to mark important regions of the page.",
            codeFix: exampleHTML.replace(/<div([^>]*)>/g, '<div$1 role="region" aria-label="Content section">')
                .replace(/<div([^>]*)>/g, '<section$1>')
        },
        'aria-roles': {
            suggestion: "Ensure all ARIA roles are used according to specifications and are appropriate for the element.",
            codeFix: `<!-- Original: ${exampleHTML} -->\n<!-- Review ARIA roles and ensure they match the element's purpose and semantics -->`
        },
        'document-title': {
            suggestion: "Provide a descriptive page title using the <title> element in the document head.",
            codeFix: `<head>\n  <title>Descriptive Page Title</title>\n  <!-- other head elements -->\n</head>`
        },
        'html-lang': {
            suggestion: "Specify the language of the document using the lang attribute on the html element.",
            codeFix: exampleHTML.replace(/<html([^>]*)>/g, '<html$1 lang="en">')
        },
        'region': {
            suggestion: "Wrap page content in landmark regions using semantic HTML5 elements (header, nav, main, footer) or ARIA landmark roles.",
            codeFix: `<!-- Original: ${exampleHTML} -->\n<!-- Recommended: Wrap content in semantic landmarks -->\n<main>\n  ${exampleHTML}\n</main>`
        }
    };

    // Default suggestion if rule not found
    const defaultSuggestion = {
        suggestion: `Fix accessibility issues related to "${ruleId}" by following WCAG guidelines.`,
        codeFix: `<!-- Original: ${exampleHTML} -->\n<!-- Review and implement fixes according to accessibility guidelines -->`
    };

    return ruleSuggestions[ruleId] || defaultSuggestion;
}

// Get CSS suggestions based on issue type
function getCSSSuggestionByType(type, selector, cssIssue, problematicCode) {
    if (type === 'ColorContrast') {
        let colorVal = '#000000'; // Default black text
        let bgVal = '#ffffff';    // Default white background

        // Extract existing values if possible
        if (cssIssue.declarations) {
            if (cssIssue.declarations.color) {
                colorVal = '#000000'; // Suggest black for better contrast
            }
            if (cssIssue.declarations['background-color']) {
                bgVal = '#ffffff'; // Suggest white for better contrast
            }
        }

        return {
            suggestion: "Increase the contrast ratio between text and background to at least 4.5:1 for normal text.",
            codeFix: `/* Original: */\n${problematicCode}\n\n/* Fixed version: */\n${selector} {\n  color: ${colorVal}; /* Darker text for better contrast */\n  background-color: ${bgVal}; /* Lighter background for better contrast */\n}`
        };
    } else if (type === 'FocusStyle') {
        return {
            suggestion: "Instead of removing the outline completely, provide an alternative focus indicator for keyboard users.",
            codeFix: `/* Original: */\n${problematicCode}\n\n/* Fixed version: */\n${selector} {\n  outline: none; /* Removing default outline is fine if you provide an alternative */\n  box-shadow: 0 0 0 2px #4a90e2; /* Add visible focus indicator */\n  /* You can also use border or other visual indicators */\n}`
        };
    }

    // Default suggestion
    return {
        suggestion: `Fix CSS accessibility issues for selector "${selector}" according to WCAG guidelines.`,
        codeFix: `/* Original: */\n${problematicCode}\n\n/* Review and implement fixes according to accessibility guidelines */`
    };
}

module.exports = {
    processReport
};