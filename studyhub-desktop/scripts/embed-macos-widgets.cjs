const fs = require("node:fs");
const path = require("node:path");

module.exports = async function embedMacWidgets(context) {
  if (context.electronPlatformName !== "darwin") return;
  const projectDir = context.packager.projectDir;
  const source = path.join(projectDir, "native", "macos", "build", "CampusFlowWidgets.appex");
  if (!fs.existsSync(source)) {
    throw new Error("CampusFlowWidgets.appex não foi compilado. Execute npm run build:mac-widgets primeiro.");
  }
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const destination = path.join(context.appOutDir, appName, "Contents", "PlugIns", "CampusFlowWidgets.appex");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
};
