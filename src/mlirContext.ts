import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as vscodelc from "vscode-languageclient/node";

import * as config from "./config";
import * as configWatcher from "./configWatcher";

/**
 *  This class represents the context of a specific workspace folder.
 */
class WorkspaceFolderContext implements vscode.Disposable {
  dispose() {
    this.clients.forEach(async (client) => await client.stop());
    this.clients.clear();
  }

  clients: Map<string, vscodelc.LanguageClient> = new Map();
}

/**
 *  This class manages all of the MLIR extension state,
 *  including the language client.
 */
export class MLIRContext implements vscode.Disposable {
  subscriptions: vscode.Disposable[] = [];
  workspaceFolders: Map<string, WorkspaceFolderContext> = new Map();
  outputChannel: vscode.OutputChannel;

  /**
   *  Activate the MLIR context, and start the language clients.
   */
  async activate(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;

    // This lambda is used to lazily start language clients for the given
    // document. It removes the need to pro-actively start language clients for
    // every folder within the workspace and every language type we provide.
    const startClientOnOpenDocument = async (document: vscode.TextDocument) => {
      await this.getOrActivateLanguageClient(document.uri, document.languageId);
    };
    // Process any existing documents.
    for (const textDoc of vscode.workspace.textDocuments) {
      await startClientOnOpenDocument(textDoc);
    }

    // Watch any new documents to spawn servers when necessary.
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(startClientOnOpenDocument)
    );
    this.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        for (const folder of event.removed) {
          const client = this.workspaceFolders.get(folder.uri.toString());
          if (client) {
            client.dispose();
            this.workspaceFolders.delete(folder.uri.toString());
          }
        }
      })
    );
  }

  /**
   * Open or return a language server for the given uri and language.
   */
  async getOrActivateLanguageClient(
    uri: vscode.Uri,
    languageId: string
  ): Promise<vscodelc.LanguageClient> {
    let serverSettingName: string;
    if (languageId === "verilog") {
      serverSettingName = "verilog_server_path";
    } else {
      return null;
    }

    // Check the scheme of the uri.
    let validSchemes = ["file"];
    if (!validSchemes.includes(uri.scheme)) {
      return null;
    }

    // Resolve the workspace folder if this document is in one. We use the
    // workspace folder when determining if a server needs to be started.
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    let workspaceFolderStr = workspaceFolder
      ? workspaceFolder.uri.toString()
      : "";

    // Get or create a client context for this folder.
    let folderContext = this.workspaceFolders.get(workspaceFolderStr);
    if (!folderContext) {
      folderContext = new WorkspaceFolderContext();
      this.workspaceFolders.set(workspaceFolderStr, folderContext);
    }
    // Start the client for this language if necessary.
    let client = folderContext.clients.get(languageId);
    if (!client) {
      client = await this.activateWorkspaceFolder(
        workspaceFolder,
        serverSettingName,
        languageId,
        this.outputChannel
      );
      folderContext.clients.set(languageId, client);
    }
    return client;
  }

  /**
   *  Prepare a compilation database option for a server.
   */
  async prepareCompilationDatabaseServerOptions(
    languageName: string,
    workspaceFolder: vscode.WorkspaceFolder,
    configsToWatch: string[],
    pathsToWatch: string[],
    additionalServerArgs: string[]
  ) {
    let design_root = config.get<string>(
      `${languageName}_design_root_directory`,
      workspaceFolder,
      ""
    );

    let mlir_path = [];
    let verilogIncludeDirs = [];
    if (design_root !== "") {
      // Recursively check find directories which contain .sv or .v files.

      async function findIncludeDirs(parent: string) {
        const files = await fs.promises.readdir(parent, {
          withFileTypes: true,
        });
        let exist_verilog = false;
        for (const file of files) {
          if (file.isFile()) {
            if (file.name.endsWith(".mlir") || file.name.endsWith(".mlirbc")) {
              mlir_path.push(path.join(parent, file.name));
            }
            if (file.name.endsWith(".sv") || file.name.endsWith(".v")) {
              exist_verilog = true;
            }
          }

          if (file.isDirectory()) {
            let dir_path = path.join(parent, file.name);
            findIncludeDirs(dir_path);
            const files = await fs.promises.readdir(dir_path, {
              withFileTypes: true,
            });
            let contain_sv_or_v = false;
            for (const file of files) {
              if (file.name.endsWith(".sv") || file.name.endsWith(".v")) {
                contain_sv_or_v = true;
              }
            }
          }
        }
        if (exist_verilog) verilogIncludeDirs.push(parent);
      }
      // Resolve relative path to the workspace folder.
      let design_root_path = await this.resolveDirectory(design_root, "", workspaceFolder);
      console.error("design_root_path", design_root_path);

      await findIncludeDirs(design_root_path);
    }

    let verilogIncludeDirsOpt = config.get<string[]>(
      `${languageName}_include_directories`,
      workspaceFolder,
      []
    );
    verilogIncludeDirs = verilogIncludeDirs.concat(verilogIncludeDirsOpt);
    verilogIncludeDirs.filter((includeDir) => includeDir !== "");
    let result_include_dirs = [];
    for (const includeDir of verilogIncludeDirs) {
      let resolvedPath = await this.resolveDirectory(
        includeDir,
        "",
        workspaceFolder
      );
      result_include_dirs.push(resolvedPath);
    }

    additionalServerArgs.push(
      ...result_include_dirs.map(
        (includeDir) => `--${languageName}-include-dir=${includeDir}`
      )
    );

    configsToWatch.push(`${languageName}_include_directories`);

    // TODO: Don't watch the include directories for now.
    // pathsToWatch.push(...result_include_dirs);

    let sourceLocationRootDirectories = config.get<string[]>(
      `${languageName}_source_location_root_directories`,
      workspaceFolder,
      []
    );

    // Add debug logging to help diagnose the issue
    console.error("Language Name:", languageName);
    console.error(
      "Config Key:",
      `${languageName}_source_location_root_directories`
    );
    console.error(
      "Source Location Directories:",
      sourceLocationRootDirectories
    );
    console.error("Workspace Folder:", workspaceFolder.uri.fsPath);

    sourceLocationRootDirectories.filter(
      (sourceLocationRootDirectory) => sourceLocationRootDirectory !== ""
    );
    let result_source_location_root_directories = [];
    for (const sourceLocationRootDirectory of sourceLocationRootDirectories) {
      let resolvedPath = await this.resolveDirectory(
        sourceLocationRootDirectory,
        "",
        workspaceFolder
      );
      result_source_location_root_directories.push(resolvedPath);
    }

    additionalServerArgs.push(
      ...result_source_location_root_directories.map(
        (sourceLocationRootDirectory) =>
          `--source-location-include-dir=${sourceLocationRootDirectory}`
      )
    );

    configsToWatch.push(`${languageName}_source_location_root_directories`);
    // TODO: Don't watch the source location root directories for now.
    // pathsToWatch.push(...result_source_location_root_directories);

    // Mlir
    let mlirPath = config.get<string>(
      `${languageName}_mlir_path`,
      workspaceFolder,
      ""
    );

    if (mlirPath !== "") {
      additionalServerArgs.push(`--mlir-path=${mlirPath}`);
    } else if (mlir_path.length == 1) {
      additionalServerArgs.push(`--mlir-path=${mlir_path[0]}`);
    } else if (mlir_path.length > 1) {
      // Choose one of the MLIR paths.
      vscode.window
        .showQuickPick(
          mlir_path.map((path) => path.split("/").pop()),
          {
            placeHolder: "Select the MLIR path",
            canPickMany: false,
          }
        )
        .then((selectedPath) => {
          additionalServerArgs.push(`--mlir-path=${selectedPath}`);
        });
    }

    configsToWatch.push(`${languageName}_mlir_path`);
    pathsToWatch.push(mlirPath);

  }

  /**
   *  Prepare the server options for a Verilog server, e.g. populating any
   *  accessible compilation databases.
   */
  async prepareVerilogServerOptions(
    workspaceFolder: vscode.WorkspaceFolder,
    configsToWatch: string[],
    pathsToWatch: string[],
    additionalServerArgs: string[]
  ) {
    await this.prepareCompilationDatabaseServerOptions(
      "verilog",
      workspaceFolder,
      configsToWatch,
      pathsToWatch,
      additionalServerArgs
    );
  }

  /**
   *  Activate the language client for the given language in the given workspace
   *  folder.
   */
  async activateWorkspaceFolder(
    workspaceFolder: vscode.WorkspaceFolder,
    serverSettingName: string,
    languageName: string,
    outputChannel: vscode.OutputChannel
  ): Promise<vscodelc.LanguageClient> {
    let configsToWatch: string[] = [];
    let filepathsToWatch: string[] = [];
    let additionalServerArgs: string[] = [];

    // Initialize additional configurations for this server.
    if (languageName === "verilog") {
      await this.prepareVerilogServerOptions(
        workspaceFolder,
        configsToWatch,
        filepathsToWatch,
        additionalServerArgs
      );
    }

    // Try to activate the language client.
    const [server, serverPath] = await this.startLanguageClient(
      workspaceFolder,
      outputChannel,
      serverSettingName,
      languageName,
      additionalServerArgs
    );
    configsToWatch.push(serverSettingName);
    filepathsToWatch.push(serverPath);

    // Watch for configuration changes on this folder.
    await configWatcher.activate(
      this,
      workspaceFolder,
      configsToWatch,
      filepathsToWatch
    );
    return server;
  }

  /**
   *  Start a new language client for the given language. Returns an array
   *  containing the opened server, or null if the server could not be started,
   *  and the resolved server path.
   */
  async startLanguageClient(
    workspaceFolder: vscode.WorkspaceFolder,
    outputChannel: vscode.OutputChannel,
    serverSettingName: string,
    languageName: string,
    additionalServerArgs: string[]
  ): Promise<[vscodelc.LanguageClient, string]> {
    const clientTitle = languageName.toUpperCase() + " Language Client";

    // Get the path of the lsp-server that is used to provide language
    // functionality.
    var serverPath = await this.resolveServerPath(
      serverSettingName,
      workspaceFolder
    );

    // If the server path is empty, bail. We don't emit errors if the user
    // hasn't explicitly configured the server.
    if (serverPath === "") {
      return [null, serverPath];
    }

    // Check that the file actually exists.
    if (!fs.existsSync(serverPath)) {
      vscode.window
        .showErrorMessage(
          `${clientTitle}: Unable to resolve path for '${serverSettingName}', please ensure the path is correct`,
          "Open Setting"
        )
        .then((value) => {
          if (value === "Open Setting") {
            vscode.commands.executeCommand(
              "workbench.action.openWorkspaceSettings",
              {
                openToSide: false,
                query: `circt-verilog-lsp.${serverSettingName}`,
              }
            );
          }
        });
      return [null, serverPath];
    }

    // Configure the server options.
    const serverOptions: vscodelc.ServerOptions = {
      command: serverPath,
      args: additionalServerArgs,
    };

    // Configure file patterns relative to the workspace folder.
    let filePattern: vscode.GlobPattern = "**/*." + languageName;
    let selectorPattern: string = null;
    if (workspaceFolder) {
      filePattern = new vscode.RelativePattern(workspaceFolder, filePattern);
      selectorPattern = `${workspaceFolder.uri.fsPath}/**/*`;
    }

    // Configure the middleware of the client. This is sort of abused to allow
    // for defining a "fallback" language server that operates on non-workspace
    // folders. Workspace folder language servers can properly filter out
    // documents not within the folder, but we can't effectively filter for
    // documents outside of the workspace. To support this, and avoid having two
    // servers targeting the same set of files, we use middleware to inject the
    // dynamic logic for checking if a document is in the workspace.
    let middleware = {};
    if (!workspaceFolder) {
      middleware = {
        didOpen: (document, next): Promise<void> => {
          if (!vscode.workspace.getWorkspaceFolder(document.uri)) {
            return next(document);
          }
          return Promise.resolve();
        },
      };
    }

    // Configure the client options.
    const clientOptions: vscodelc.LanguageClientOptions = {
      documentSelector: [{ language: languageName, pattern: selectorPattern }],
      synchronize: {
        // Notify the server about file changes to language files contained in
        // the workspace.
        fileEvents: vscode.workspace.createFileSystemWatcher(filePattern),
      },
      outputChannel: outputChannel,
      workspaceFolder: workspaceFolder,
      middleware: middleware,

      // Don't switch to output window when the server returns output.
      revealOutputChannelOn: vscodelc.RevealOutputChannelOn.Never,
    };

    // Create the language client and start the client.
    let languageClient = new vscodelc.LanguageClient(
      languageName + "-lsp",
      clientTitle,
      serverOptions,
      clientOptions
    );
    languageClient.start();
    return [languageClient, serverPath];
  }

  /**
   * Given a server setting, return the default server path.
   */
  static getDefaultServerFilename(serverSettingName: string): string {
    if (serverSettingName === "verilog_server_path") {
      return "circt-verilog-lsp";
    }
    return "";
  }

  async resolveDirectory(
    directoryPath: string,
    defaultPath: string,
    workspaceFolder: vscode.WorkspaceFolder
  ): Promise<string> {
    if (directoryPath === "") {
      if (defaultPath === "") {
        return directoryPath;
      }
      directoryPath = defaultPath;
    }

    directoryPath = directoryPath.replace(
      "${workspaceFolder}",
      workspaceFolder.uri.fsPath
    );

    // If the path is already fully resolved, there is nothing to do.
    if (path.isAbsolute(directoryPath)) {
      return directoryPath;
    }

    // Return relative path to the workspace folder.
    return path.relative(workspaceFolder.uri.fsPath, directoryPath);
  }

  /**
   * Try to resolve the given path, or the default path, with an optional
   * workspace folder. If a path could not be resolved, just returns the
   * input filePath.
   */

  async resolvePath(
    filePath: string,
    defaultPath: string,
    workspaceFolder: vscode.WorkspaceFolder
  ): Promise<string> {
    const configPath = filePath;

    // If the path is already fully resolved, there is nothing to do.
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // If a path hasn't been set, try to use the default path.
    if (filePath === "") {
      if (defaultPath === "") {
        return filePath;
      }
      filePath = defaultPath;

      // Fallthrough to try resolving the default path.
    }

    // Try to resolve the path relative to the workspace.
    let filePattern: vscode.GlobPattern = "**/" + filePath;
    if (workspaceFolder) {
      filePattern = new vscode.RelativePattern(workspaceFolder, filePattern);
    }
    let foundUris = await vscode.workspace.findFiles(filePattern, null, 1);
    if (foundUris.length === 0) {
      // If we couldn't resolve it, just return the original path anyways. The
      // file might not exist yet.
      return configPath;
    }
    // Otherwise, return the resolved path.
    return foundUris[0].fsPath;
  }

  /**
   * Try to resolve the path for the given server setting, with an optional
   * workspace folder.
   */
  async resolveServerPath(
    serverSettingName: string,
    workspaceFolder: vscode.WorkspaceFolder
  ): Promise<string> {
    const serverPath = config.get<string>(serverSettingName, workspaceFolder);
    const defaultPath = MLIRContext.getDefaultServerFilename(serverSettingName);
    return this.resolvePath(serverPath, defaultPath, workspaceFolder);
  }

  /**
   * Return the language client for the given language and uri, or null if no
   * client is active.
   */
  getLanguageClient(
    uri: vscode.Uri,
    languageName: string
  ): vscodelc.LanguageClient {
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    let workspaceFolderStr = workspaceFolder
      ? workspaceFolder.uri.toString()
      : "";
    let folderContext = this.workspaceFolders.get(workspaceFolderStr);
    if (!folderContext) {
      return null;
    }
    return folderContext.clients.get(languageName);
  }

  dispose() {
    this.subscriptions.forEach((d) => {
      d.dispose();
    });
    this.subscriptions = [];
    this.workspaceFolders.forEach((d) => {
      d.dispose();
    });
    this.workspaceFolders.clear();
  }
}
