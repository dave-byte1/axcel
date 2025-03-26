// Dummy AI suggestion for CLI testing purposes
module.exports.processReport = async (report) => {
    return [`Suggestion for issues: ${report.issues.join(', ')}`];
};