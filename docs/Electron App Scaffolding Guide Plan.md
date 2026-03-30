# **Architectural Blueprint and Exhaustive Scaffolding Guide for Local-First AI Desktop Environments**

## **The Local-First Desktop Paradigm and Architectural Vision**

The landscape of desktop application development has undergone a profound paradigm shift, driven by the escalating demand for local-first, privacy-centric artificial intelligence tools. Applications designed to process sensitive user data, perform offline inference, and manage semantic search capabilities entirely on the host machine require a highly specific, robust technological foundation. The "Sxentrie" application archetype represents this modern class of software: an AI desktop application that guarantees data sovereignty by running entirely locally, avoiding cloud dependency, and maintaining strict execution boundaries.

To construct such an application, the underlying architecture must support complex background processing, high-performance graphical rendering, and seamless integration with native operating system binaries. The framework of choice for cross-platform desktop deployment remains Electron, combined with a React-based user interface. However, scaffolding a modern, secure, and performant Electron application requires navigating a labyrinth of build tools, process models, and native module compilation hurdles.

This exhaustive report details the definitive scaffolding strategy, version compatibility matrix, architectural topology, and mitigation protocols required to initialize a local-first AI application. The target stack strictly utilizes Long-Term Support (LTS) runtimes, comprising Electron, Node.js, the electron-vite build orchestrator, the pnpm package manager, React, TypeScript, LanceDB for local vector storage, Zustand for state management, and Tailwind CSS alongside Radix UI for interface styling.

## **Foundational Runtime and Framework Matrix Definition**

The stability of a local-first application relies entirely on the predictability of its underlying runtime environment. Employing bleeding-edge or beta software introduces unacceptable regression risks, particularly concerning native module bindings and inter-process communication serialization. Therefore, a strict adherence to Long-Term Support versions is required.

The background execution environment of the application is governed by Node.js. The Node.js release schedule dictates that even-numbered releases enter an "Active LTS" phase in October of their release year and are supported for roughly three years.1 Odd-numbered releases are transitional and never achieve long-term stability. As of the current technological landscape, the optimal runtime target is Node.js v24.x, internally codenamed Krypton.1 Node.js v24 transitioned into Active LTS in October 2025, with rigorous maintenance extending until April 2028\.1 Consequently, Node.js v24.14.x represents the most secure, performant, and stable foundation for new desktop applications.3

Electron's release cycle is tightly coupled with the Chromium browser engine, releasing a new major version every eight weeks to mirror Chromium's four-week cadence.5 Because Electron embeds both Node.js and Chromium within a single compiled binary, selecting the correct version requires aligning the Electron release with the chosen Node.js LTS version. Based on the release schedule, Electron version 40 (specifically version 40.8.x) utilizes Node.js 24.14.0 and Chromium 144\.6 It achieved stable status in early 2026\.8 Selecting Electron 40 guarantees alignment with the Node.js v24 Active LTS timeline while providing a modernized Chromium rendering engine for the React interface.

| Technology Component | Approved Version | Justification and Status                                                              |
| :------------------- | :--------------- | :------------------------------------------------------------------------------------ |
| **Node.js**          | v24.14.x (LTS)   | Active LTS (Krypton); provides the V8 engine baseline and native OS access.1          |
| **Chromium**         | v144.x           | Embedded within Electron 40; ensures modern CSS variables and hardware acceleration.7 |
| **Electron**         | v40.8.x          | Current Stable LTS alignment; embeds Node 24 and Chromium 144\.7                      |
| **TypeScript**       | v5.x             | Enforces strict type safety across isolated process boundaries and API contracts.     |
| **React**            | v18.x or v19.x   | Provides the concurrent rendering engine necessary for fluid user interfaces.9        |

## **The Electron Process Model and Security Boundaries**

Understanding Electron's process model is paramount for an entry-level developer to prevent catastrophic security vulnerabilities. If configured improperly, a desktop application can inadvertently allow Cross-Site Scripting payloads to escalate into Remote Code Execution attacks, granting malicious scripts full control over the user's filesystem. To prevent this, the application is structurally divided into highly segregated domains.

## **The Main Process Authority**

The Main Process serves as the application's backend authority. It executes within a full Node.js environment and possesses unfettered access to the host operating system, including the file system, network interfaces, and native binaries. There is strictly one Main Process per application. It is responsible for application lifecycle events, instantiating browser windows, and executing heavy computational logic such as interacting with local vector databases. Because it holds absolute power over the host machine, visual rendering and untrusted data processing must never occur within this domain.

## **The Renderer Process Sandbox**

The Renderer Process displays the graphical user interface. It executes within a Chromium context and runs the React application. For security purposes, the Renderer Process must be strictly sandboxed. The configuration must have nodeIntegration disabled and contextIsolation enabled.10 This guarantees that malicious or compromised JavaScript running in the React interface cannot access Node.js APIs. If an attacker injects a script into the frontend, they cannot invoke the filesystem module to read or write data. The Renderer is effectively a standard web browser tab that happens to be running locally.

## **The Preload Script and Context Isolation**

Because the Renderer cannot access Node.js directly, a mechanism is required to bridge the gap. The Preload Script runs in a specialized state: it has access to a subset of Node.js APIs but executes immediately before the web page loads. Under the principle of Context Isolation, the Preload Script uses the contextBridge API to expose specific, tightly controlled functions to the Renderer's global window object.11 This creates a secure, type-safe API for the React application to request data from the Main Process without granting the React application direct backend access.

## **Inter-Process Communication and The Context Bridge**

When the React application needs to query the local LanceDB vector database, it cannot do so directly due to the security sandbox. Instead, it relies on Inter-Process Communication. The architecture demands a structured, asynchronous communication bridge.12

To conceptualize this architecture, consider a highly secure bank. The Main Process is the vault manager; it possesses the keys to the physical vault where the database and filesystem reside. The Renderer Process is the public storefront where customers interact. Customers are strictly prohibited from entering the vault. The Preload Script functions as the bulletproof teller window. When the storefront interface requires data, it submits a highly specific request slip to the teller. The teller passes this slip to the vault manager. The manager retrieves the data, hands it back to the teller, and the teller delivers it to the storefront.

This separation ensures that even if the storefront is compromised, the attacker only has access to the teller window. They cannot access the vault directly; they can only make predefined requests that the vault manager is programmed to accept.

When implementing this, a critical limitation of the Context Bridge must be understood. The bridge relies on the HTML Structured Clone Algorithm to serialize data passed between the processes.14 Complex objects containing functions, prototype chains, or native class instances cannot be serialized. If a developer attempts to return a direct LanceDB database connection object or a custom class instance across the boundary, it will be silently stripped or will throw a serialization exception.14 The Main process must execute the data retrieval and map the results strictly into plain JavaScript objects, strings, or arrays before returning them.

## **Build Orchestration Mechanics**

The orchestration of a multi-process Electron application demands sophisticated build tooling. Historically, compiling the Main Process, Preload Scripts, and Renderer Process required labyrinthine configurations that were prone to silent failures. The modern paradigm relies exclusively on Vite, implemented via the electron-vite orchestration tool.

## **The Necessity of Strict Dependency Resolution**

Dependency resolution in monolithic desktop applications can lead to massive disk space consumption and non-deterministic builds. The package manager pnpm is strictly mandated for this architecture. Unlike legacy package managers that flatten dependencies into a single massive directory, pnpm utilizes a global content-addressable store and hard links. This ensures that dependencies are installed exactly once on a given machine, drastically reducing the footprint.15

More importantly, pnpm enforces strict dependency resolution. Modules cannot access packages they do not explicitly declare in their configuration files. This eliminates the phenomenon of phantom dependencies, where an application accidentally relies on a sub-dependency installed by another package. In Electron environments, phantom dependencies are a leading cause of packaging failures during the final distribution build.

## **Tri-Target Build Orchestration**

The electron-vite utility is a specialized build tool that extends Vite to handle Electron's unique dual-environment nature.15 Vite leverages highly parallelized processes for hyper-fast dependency pre-bundling during development and optimized outputs for production builds.

The orchestrator automatically segments the application into three discrete configuration targets.15 The Main target processes backend code against the Node.js environment. The Preload target compiles scripts for the restricted bridge environment. The Renderer target processes the React application against the Chromium browser environment, enabling instantaneous Hot Module Replacement as the developer modifies the interface.

## **The Native Module Compilation Conundrum**

The most complex infrastructural hurdle in scaffolding an AI desktop application is the integration of local vector databases. LanceDB is a high-performance vector database built in Rust, provided to Node.js as a native module. A native module is a dynamically linked library, compiled from C++ or Rust bindings, that interfaces directly with the host operating system.18

## **Resolving Application Binary Interface Mismatches**

Native modules are compiled against a specific Application Binary Interface of the V8 JavaScript engine. The version of Node.js installed on the developer's host machine almost certainly possesses a different interface than the Node.js version embedded inside the target Electron framework.19

When the developer invokes the package manager to install the vector database, the package manager downloads the precompiled binaries for the host's system Node.js. When the Electron Main process subsequently attempts to load the module into memory, a fatal execution error occurs, indicating that the module was compiled against an incompatible Node.js version.19

To resolve this mismatch, the native module must be explicitly rebuilt against Electron's specific header files. The industry-standard utility for this procedure is @electron/rebuild.19 This utility queries the installed Electron version, downloads the corresponding C++ header files from the Electron release repository, and invokes system compilation tools to recompile the native Rust and C++ bindings specifically for the Electron interface.20 This process must be integrated into the package manager's lifecycle hooks, typically executed automatically following any dependency installation.22

## **Bundler Externalization and Archive Unpacking**

Furthermore, modern build bundlers attempt to statically analyze and concatenate all required JavaScript into a single file to optimize load times. However, bundlers cannot process or bundle binary files. Therefore, the orchestrator must be explicitly instructed to treat the native database module as an external dependency. In the build configuration, the native module must be added to the external array.17 This ensures the bundler leaves the import statements intact, allowing Electron to dynamically load the binary at runtime.15

Finally, during the production build phase, Electron packages the application's source code into a highly compressed archive format known as ASAR. Operating systems cannot execute or memory-map native binaries that are trapped inside an archive file. The build configuration must include an unpacking directive that physically extracts binary files out of the archive and places them in an unpacked directory adjacent to the executable, ensuring they can be loaded by the operating system at runtime.25

## **State Management and Schema Validation**

Managing complex application state, such as AI chat histories, active vector search parameters, and user configurations, requires a predictable and performant state engine.

Zustand is selected for this architecture due to its minimalistic boilerplate, hook-based implementation, and ability to manage state outside the React component tree.26 In an Electron architecture, the state engine is instantiated within the Renderer process. To achieve persistent, local-first state, the store must be hydrated via the communication bridge. When the application initializes, the state engine invokes an asynchronous call to the Main process to read local configuration files or database records, subsequently hydrating the visual interface.14

Because messages are serialized and passed between isolated security domains, boundary validation is critical. The Main process must never trust the payload originating from the visual interface. Zod, a TypeScript-first schema declaration and validation library, provides strict runtime enforcement. A shared configuration file defines the expected shape of all data payloads. Both the React frontend and the Node.js backend invoke schema parsing before dispatching or processing a message, guaranteeing type safety and preventing injection attacks across the process boundary.

## **Interface Styling and Component Architecture**

The visual layer of the AI desktop application necessitates a rapid, utility-first styling methodology combined with accessible, unstyled component primitives.

## **Multi-Process CSS Configuration**

Tailwind CSS v4 introduces a fundamental architectural shift. Previous versions relied heavily on PostCSS and a monolithic configuration file.9 The modern implementation integrates directly into the build pipeline via a dedicated Vite plugin.27

However, integrating this into a multi-process Electron application introduces a critical failure mode. Tailwind CSS works by scanning source code for utility class names and generating the corresponding CSS on demand. If the plugin is configured globally, it wastes computational resources scanning Node.js backend files that contain no visual elements, causing build failures or missing styles.30

The plugin must be explicitly and exclusively injected into the renderer object within the build configuration.28 Furthermore, the traditional configuration file must explicitly define the content array paths, pointing strictly to the renderer directory containing the React components. This guarantees that only the React component tree is evaluated by the compiler, preventing missing styles and optimizing performance.

## **Interface Primitives and Hardware Acceleration**

To construct complex interfaces such as AI chat modals, data tables, and setting panels, Radix UI provides headless, accessible component primitives. Radix ensures compliance with accessibility standards and manages complex interactions like focus trapping and keyboard navigation out of the box.

Framer Motion handles declarative animations. In an Electron environment running a dedicated Chromium instance, Framer Motion can leverage hardware-accelerated CSS transforms and GPU offloading. This provides fluid, high-framerate animations for interface transitions without taxing the main JavaScript thread, ensuring the application feels responsive even during heavy local inference workloads.32

## **Complex Content Rendering and Abstract Syntax Trees**

AI applications output highly structured text, including code snippets, tables, and mathematical formulas. Generative AI models stream these tokens sequentially. This output often contains mathematical formulas enclosed in specific LaTeX delimiters. Naive rendering using inner HTML injection combined with regular expression replacements exposes the Electron application to severe security vulnerabilities.33 If a compromised model injects a malicious script tag, and the renderer executes it, the attacker could potentially breach the communication bridge.

To mitigate this, the content rendering engine utilizes a library that safely parses markdown strings into an Abstract Syntax Tree. This is achieved using the unified ecosystem, specifically the remark parser for Markdown and the rehype processor for HTML.34 Because it relies on analyzing the structural tree of the document rather than executing raw strings, it strictly mitigates injection risks.34

To support scientific notation, the parsing pipeline is extended with plugins to parse mathematical block syntax and transform these nodes into semantic HTML elements styled by the KaTeX typographical engine.35 The developer must ensure the corresponding CSS definitions are imported into the application to guarantee accurate rendering of complex equations.33 Furthermore, GitHub Flavored Markdown is supported to properly render the complex tables commonly produced by large language models.33

## **The Exhaustive Scaffolding Guide**

The following documentation represents the exact, chronological instructions and configuration files required for an entry-level developer to securely initialize the application.

## **Stage 1: Host Environment Prerequisites**

Before initiating the scaffolding sequence, the developer must ensure the host operating system is equipped with the required toolchain. The runtime environment relies on the Node.js Active LTS release.

Bash

\# Verify the presence of the Node Version Manager and install the LTS runtime  
nvm install 24  
nvm use 24

\# Verify the global installation of the strict package manager  
npm install \-g pnpm

## **Stage 2: Base Application Scaffolding**

The initialization sequence utilizes the official orchestrator templates to generate the tri-directory architecture. The developer must execute the creation command and select the React and TypeScript framework options when prompted.

Bash

\# Initialize the monorepo structure  
pnpm create @quick-start/electron sxentrie

\# Navigate into the generated workspace  
cd sxentrie

\# Resolve and install the baseline dependencies  
pnpm install

The execution of these commands generates a structured workspace. The src/main directory contains the backend logic. The src/preload directory contains the security bridge. The src/renderer directory contains the visual React hierarchy.

## **Stage 3: Core Dependency Acquisition**

The application requires specific libraries to handle interface styling, state management, payload validation, and complex markdown rendering. These must be installed into the workspace.

Bash

\# Install the state management engine and schema validation library  
pnpm add zustand zod

\# Install the Abstract Syntax Tree parsers for Markdown and Mathematics  
pnpm add react-markdown remark-gfm remark-math rehype-katex katex

\# Install headless interface primitives, icons, and hardware-accelerated animations  
pnpm add @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-tooltip lucide-react framer-motion

## **Stage 4: Multi-Process Styling Configuration**

To enable utility-first styling without interfering with the Node.js backend compilation, the developer must install the modern styling engine and configure it exclusively for the visual renderer.

Bash

\# Install the styling engine and its orchestrator plugin as development dependencies  
pnpm add \-D tailwindcss @tailwindcss/vite

The developer must create the configuration file at the root of the workspace. This file strictly defines the content paths, ensuring the compiler only evaluates files within the visual hierarchy, addressing the critical failure mode associated with multi-process environments.

JavaScript

// tailwind.config.js  
/\*\* @type {import('tailwindcss').Config} \*/  
module.exports \= {  
 content: \[  
 "./src/renderer/index.html",  
 "./src/renderer/src/\*\*/\*.{js,ts,jsx,tsx}"  
 \],  
 theme: {  
 extend: {},  
 },  
 plugins:,  
}

Next, the orchestrator configuration must be modified to inject the styling plugin solely into the Chromium target.

TypeScript

// electron.vite.config.ts  
import { resolve } from 'path'  
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'  
import react from '@vitejs/plugin-react'  
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({  
 main: {  
 plugins:  
 },  
 preload: {  
 plugins:  
 },  
 renderer: {  
 resolve: {  
 alias: {  
 '@renderer': resolve('src/renderer/src')  
 }  
 },  
 plugins: \[  
 react(),  
 tailwindcss()  
 \]  
 }  
})

Finally, the primary cascading stylesheet must be updated to trigger the compiler and import the mathematical typography rules.

CSS

/\* src/renderer/src/assets/main.css \*/  
@import "tailwindcss";  
@import "katex/dist/katex.min.css";

@theme {  
 \--color\-primary: \#3b82f6;  
}

body {  
 background-color: \#0f172a;  
 color: \#f8fafc;  
}

## **Stage 5: Native Module Integration and Recompilation**

Integrating the local vector database requires careful handling of the Application Binary Interface to prevent runtime execution failures. The database and the recompilation utility must be installed.

Bash

\# Install the high-performance local vector database  
pnpm add @lancedb/lancedb

\# Install the recompilation utility as a development dependency  
pnpm add \-D @electron/rebuild

To automate the resolution of the binary mismatch, the developer must modify the application's manifest file to trigger the recompilation utility immediately after any dependency installation. This guarantees the binaries are always aligned with the specific V8 engine embedded in the Electron framework.

JSON

// package.json (excerpt)  
{  
 "scripts": {  
 "dev": "electron-vite dev",  
 "build": "electron-vite build && electron-builder",  
 "postinstall": "electron-rebuild \-f \-w @lancedb/lancedb"  
 }  
}

The developer must execute the manual recompilation command once to establish the initial bindings.

Bash

\# Recompile the native bindings for the current architecture  
pnpm run postinstall

To prevent the orchestrator from attempting to bundle the compiled binary, the build configuration must be updated to explicitly externalize the database module within the backend context.

TypeScript

// electron.vite.config.ts (update)  
export default defineConfig({  
 main: {  
 build: {  
 rollupOptions: {  
 external: \['@lancedb/lancedb'\]  
 }  
 },  
 plugins:  
 },  
 //... preload and renderer configurations remain unchanged  
})

## **Stage 6: Establishing the Security Bridge and IPC Architecture**

The final scaffolding stage requires wiring the isolated processes together using a secure, type-safe communication channel. This ensures the visual interface can query the backend database without violating the security sandbox.

First, the backend must establish an asynchronous handler to receive requests, interact with the native database module, and return serialized data.

TypeScript

// src/main/index.ts (excerpt)  
import { app, BrowserWindow, ipcMain } from 'electron'  
import \* as lancedb from '@lancedb/lancedb'

// Establish an asynchronous handler for database queries  
ipcMain.handle('database:connect', async (\_, storageUri: string) \=\> {  
 try {  
 const database \= await lancedb.connect(storageUri);  
 const tableNames \= await database.tableNames();  
 // Return exclusively plain JavaScript arrays or objects to satisfy serialization constraints  
 return tableNames;  
 } catch (error) {  
 console.error('Vector Database Connection Failure:', error);  
 return;  
 }  
});

Second, the security bridge must expose a tightly controlled function to the visual interface, mapping the invocation to the specific backend channel.

TypeScript

// src/preload/index.ts (excerpt)  
import { contextBridge, ipcRenderer } from 'electron'

// Expose a secure API to the global window object of the isolated renderer  
contextBridge.exposeInMainWorld('secureApi', {  
 fetchVectorTables: (storageUri: string) \=\> {  
 return ipcRenderer.invoke('database:connect', storageUri);  
 }  
});

Third, the TypeScript definitions for the visual interface must be updated to recognize the exposed API, ensuring compile-time safety across the process boundary.

TypeScript

// src/renderer/src/env.d.ts (excerpt)  
/// \<reference types="vite/client" /\>

// Extend the global Window interface with the specific API contract  
interface Window {  
 secureApi: {  
 fetchVectorTables: (storageUri: string) \=\> Promise\<string\>;  
 }  
}

Through this rigorous scaffolding sequence, the application achieves a state of highly optimized architectural readiness. The environment seamlessly supports complex background vector processing while maintaining an impenetrable security boundary, enabling the developer to construct the visual React components with absolute confidence in the underlying infrastructure.

#### **Works cited**

1. Node.js Release Working Group \- GitHub, accessed March 30, 2026, [https://github.com/nodejs/Release](https://github.com/nodejs/Release)
2. Node.js Releases, accessed March 30, 2026, [https://nodejs.org/en/about/previous-releases](https://nodejs.org/en/about/previous-releases)
3. Node.js | endoflife.date, accessed March 30, 2026, [https://endoflife.date/nodejs](https://endoflife.date/nodejs)
4. Download Node.js, accessed March 30, 2026, [https://nodejs.org/en/download/current](https://nodejs.org/en/download/current)
5. Electron Releases, accessed March 30, 2026, [https://electronjs.org/docs/latest/tutorial/electron-timelines](https://electronjs.org/docs/latest/tutorial/electron-timelines)
6. Electron Releases, accessed March 30, 2026, [https://releases.electronjs.org/](https://releases.electronjs.org/)
7. All \- Electron Releases, accessed March 30, 2026, [https://releases.electronjs.org/release](https://releases.electronjs.org/release)
8. Electron (software framework) \- Wikipedia, accessed March 30, 2026, [https://en.wikipedia.org/wiki/Electron\_(software_framework)](<https://en.wikipedia.org/wiki/Electron_(software_framework)>)
9. Electron \+ React \+ TypeScript \+ Tailwind CSS \= Awesomeness | by Mosaif Ali \- Medium, accessed March 30, 2026, [https://medium.com/@mosaif.ali.39/electron-react-typescript-tailwind-css-awesomeness-9256fae116b1](https://medium.com/@mosaif.ali.39/electron-react-typescript-tailwind-css-awesomeness-9256fae116b1)
10. electron-best-practices | Skills Mar... \- LobeHub, accessed March 30, 2026, [https://lobehub.com/de/skills/jwynia-agent-skills-electron-best-practices](https://lobehub.com/de/skills/jwynia-agent-skills-electron-best-practices)
11. contextBridge \- Electron, accessed March 30, 2026, [https://electronjs.org/docs/latest/api/context-bridge](https://electronjs.org/docs/latest/api/context-bridge)
12. Inter-Process Communication \- Electron, accessed March 30, 2026, [https://electronjs.org/docs/latest/tutorial/ipc](https://electronjs.org/docs/latest/tutorial/ipc)
13. Inter Process Communication in Electron | by Cristian Deleon \- Medium, accessed March 30, 2026, [https://medium.com/@libaration/inter-process-communication-in-electron-34c52125dd7](https://medium.com/@libaration/inter-process-communication-in-electron-34c52125dd7)
14. Confused about contextBridge and IPC return type from native node modules \- Reddit, accessed March 30, 2026, [https://www.reddit.com/r/electronjs/comments/1golv92/confused_about_contextbridge_and_ipc_return_type/](https://www.reddit.com/r/electronjs/comments/1golv92/confused_about_contextbridge_and_ipc_return_type/)
15. Getting Started | electron-vite, accessed March 30, 2026, [https://electron-vite.org/guide/](https://electron-vite.org/guide/)
16. How to set up Vite and Electron from scratch, with any frontend framework \- DEV Community, accessed March 30, 2026, [https://dev.to/lucacicada/how-to-set-up-vite-and-electron-from-scratch-with-any-frontend-framework-40mb](https://dev.to/lucacicada/how-to-set-up-vite-and-electron-from-scratch-with-any-frontend-framework-40mb)
17. Configuring electron-vite, accessed March 30, 2026, [https://electron-vite.org/config/](https://electron-vite.org/config/)
18. Feature: Please create @lancedb/lancedb-win32-arm64-msvc prebuilt package for Node.js · Issue \#1954 \- GitHub, accessed March 30, 2026, [https://github.com/lancedb/lancedb/issues/1954](https://github.com/lancedb/lancedb/issues/1954)
19. Native Node Modules | Electron, accessed March 30, 2026, [https://electronjs.org/docs/latest/tutorial/using-native-node-modules](https://electronjs.org/docs/latest/tutorial/using-native-node-modules)
20. Package to rebuild native Node.js modules against the currently installed Electron version \- GitHub, accessed March 30, 2026, [https://github.com/electron/rebuild](https://github.com/electron/rebuild)
21. Using Native Node Modules | Electron \- GitHub Pages, accessed March 30, 2026, [https://zeke.github.io/electron.atom.io/docs/tutorial/using-native-node-modules/](https://zeke.github.io/electron.atom.io/docs/tutorial/using-native-node-modules/)
22. Using native modules in Electron | BigBinary Blog, accessed March 30, 2026, [https://www.bigbinary.com/blog/native-modules-electron](https://www.bigbinary.com/blog/native-modules-electron)
23. Vite Plugin \- Electron Forge, accessed March 30, 2026, [https://www.electronforge.io/config/plugins/vite](https://www.electronforge.io/config/plugins/vite)
24. How can I use native Node modules in my packaged Electron application? \- Stack Overflow, accessed March 30, 2026, [https://stackoverflow.com/questions/79435783/how-can-i-use-native-node-modules-in-my-packaged-electron-application](https://stackoverflow.com/questions/79435783/how-can-i-use-native-node-modules-in-my-packaged-electron-application)
25. electron-builder: Node module not being found in packaged app \- Stack Overflow, accessed March 30, 2026, [https://stackoverflow.com/questions/77732915/electron-builder-node-module-not-being-found-in-packaged-app](https://stackoverflow.com/questions/77732915/electron-builder-node-module-not-being-found-in-packaged-app)
26. Has it sense to use Zustand and Context Api at the same time? : r/reactjs \- Reddit, accessed March 30, 2026, [https://www.reddit.com/r/reactjs/comments/1itf0sz/has_it_sense_to_use_zustand_and_context_api_at/](https://www.reddit.com/r/reactjs/comments/1itf0sz/has_it_sense_to_use_zustand_and_context_api_at/)
27. Installing Tailwind CSS with Vite, accessed March 30, 2026, [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
28. Electron-vite \+ React \+ Tailwindcss v4 \- Stack Overflow, accessed March 30, 2026, [https://stackoverflow.com/questions/79562593/electron-vite-react-tailwindcss-v4](https://stackoverflow.com/questions/79562593/electron-vite-react-tailwindcss-v4)
29. tailwind css installed but not working in my vite \+ react project · tailwindlabs tailwindcss · Discussion \#12312 \- GitHub, accessed March 30, 2026, [https://github.com/tailwindlabs/tailwindcss/discussions/12312](https://github.com/tailwindlabs/tailwindcss/discussions/12312)
30. How to add Tailwind CSS to Electron-Vite project. : r/electronjs \- Reddit, accessed March 30, 2026, [https://www.reddit.com/r/electronjs/comments/17kzfsv/how_to_add_tailwind_css_to_electronvite_project/](https://www.reddit.com/r/electronjs/comments/17kzfsv/how_to_add_tailwind_css_to_electronvite_project/)
31. Migration to tailwind v4 is not working · Issue \#741 · alex8088/electron-vite \- GitHub, accessed March 30, 2026, [https://github.com/alex8088/electron-vite/issues/741](https://github.com/alex8088/electron-vite/issues/741)
32. How to install Motion for React, accessed March 30, 2026, [https://motion.dev/docs/react-installation](https://motion.dev/docs/react-installation)
33. React Markdown not rendering properly with a mix of html and katex \- Stack Overflow, accessed March 30, 2026, [https://stackoverflow.com/questions/79057830/react-markdown-not-rendering-properly-with-a-mix-of-html-and-katex](https://stackoverflow.com/questions/79057830/react-markdown-not-rendering-properly-with-a-mix-of-html-and-katex)
34. remarkjs/react-markdown: Markdown component for React \- GitHub, accessed March 30, 2026, [https://github.com/remarkjs/react-markdown](https://github.com/remarkjs/react-markdown)
35. rehype-katex \- NPM, accessed March 30, 2026, [https://www.npmjs.com/package/rehype-katex](https://www.npmjs.com/package/rehype-katex)
36. Katex rehype plugin does not render markdown math · Issue \#777 \- GitHub, accessed March 30, 2026, [https://github.com/remarkjs/react-markdown/issues/777](https://github.com/remarkjs/react-markdown/issues/777)
