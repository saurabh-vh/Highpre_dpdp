// Fails fast with a clear message on unsupported Node versions.
// MongoDB's driver (via Mongoose 9) needs Node 20.19+, and older versions lack
// web globals such as `File` that Next.js and its dependencies expect.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 19)) {
  console.error(
    `\n  HighPre needs Node.js 20.19 or newer. You're running ${process.versions.node}.\n` +
      `  Install Node 22 LTS from https://nodejs.org (or run "nvm install 22 && nvm use 22"),\n` +
      `  then delete node_modules and run "npm install" again.\n`,
  );
  process.exit(1);
}
