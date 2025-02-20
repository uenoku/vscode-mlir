import * as vscode from "vscode";

import { Command } from "../../command";
import { MLIRContext } from "../../mlirContext";
import { assert } from "console";
import { endianness } from "os";
import { get } from "../../config";
/**
 * The parameters to the verilog/viewOutput command. These parameters are:
 * - `uri`: The URI of the file to view.
 * - `kind`: The kind of the output to generate.
 */
type GoToObjectDefinitionParams = Partial<{ path: string }>;

/**
 * The output of the commands:
 * - `output`: The output string of the command, e.g. a .mlir PDL string.
 */
// No output.
type GoToObjectDefinitionResult = Partial<vscode.Location[]>;

/**
 * A command that displays the output of the current Verilog document.
 */
export class GoToObjectDefinitionCommand extends Command {
  constructor(context: MLIRContext) {
    super("circt-verilog-lsp.goToObjectDefinition", context);
  }

  async execute(args: any) {
    let verilogClient: vscodelc.LanguageClient;

    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId != "verilog") {
        continue;
      }

      verilogClient = this.context.getLanguageClient(
        editor.document.uri,
        "verilog"
      );
      if (!verilogClient) {
        continue;
      }
      // Check if mlir file is provided
      const mlirFile = get<string>(
        "verilog_mlir_file",
        vscode.workspace.getWorkspaceFolder(editor.document.uri),
        ""
      );

      const designRoot = get<string>(
        "verilog_design_root_directory",
        vscode.workspace.getWorkspaceFolder(editor.document.uri),
        ""
      );

      if (mlirFile == "" && designRoot == "") {
        vscode.window.showErrorMessage(
          "No mlir file or design root directory provided. Please provide a mlir file or design root directory in the settings to enable GoToObjectDefinition command."
        );
        return;
      }

      break;
    }

    if (!verilogClient) {
      vscode.window.showErrorMessage(
        "No verilog language client found. Please open a (random) verilog file along with waveform first if you want to use circt-verilog-lsp integration."
      );
      return;
    }

    // Validate the first argument
    if (!args.path) {
      console.error("Invalid arguments provided to goToObjectDefinition");
      return;
    }

    let params: GoToObjectDefinitionParams = {
      path: args.path,
    };

    const result: GoToObjectDefinitionResult | undefined =
      await verilogClient.sendRequest("verilog/goToObjectDefinition", params);
    console.error("result", result);
    if (!result) {
      return;
    }
    if (result.length == 0) {
      return;
    }
    // Open the file.
    if (result.length > 1) {
      // vscode.window.showWarningMessage(
      //   "Multiple locations found for object definition. Opening first location."
      // );
    }

    let documentUri = result[0].uri;
    if (typeof documentUri === "string") {
      documentUri = vscode.Uri.parse(documentUri);
    }

    try {
      // Check if the document is already open in the workspace.
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.fsPath === documentUri.fsPath) {
          // Change the cursor to the location.
          editor.selection = new vscode.Selection(
            result[0].range.start,
            result[0].range.end
          );
          editor.revealRange(
            new vscode.Range(result[0].range.start, result[0].range.end),
            vscode.TextEditorRevealType.InCenter
          );
          return;
        }
      }
      await vscode.window.showTextDocument(documentUri, {
        selection: new vscode.Range(result[0].range.start, result[0].range.end),
        viewColumn: vscode.ViewColumn.Beside,
      });
    } catch (error) {
      console.error("Failed to open document:", error);
      vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
    }

    return;
  }
}
