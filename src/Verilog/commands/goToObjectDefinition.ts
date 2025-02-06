import * as vscode from 'vscode'

import {Command} from '../../command';
import {MLIRContext} from '../../mlirContext';
import { assert } from 'console';

/**
 * The parameters to the verilog/viewOutput command. These parameters are:
 * - `uri`: The URI of the file to view.
 * - `kind`: The kind of the output to generate.
 */
type GoToObjectDefinitionParams = Partial<{path : string}>;

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
  constructor(context: MLIRContext) { super('circt-verilog-lsp.goToObjectDefinition', context); }

  async execute(args: any) {
    const editor = vscode.window.activeTextEditor;
    let verilogClient;
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId != 'verilog') {
        continue;
      }

      verilogClient =
          this.context.getLanguageClient(editor.document.uri, "verilog");
      if (!verilogClient) {
        continue;
      }

      break;
    }

    if (!verilogClient) {
      return;
    }

    // if (editor.document.languageId != 'verilog')
    //   return;

    // Check to see if a language client is active for this document.
    // const verilogClient =
    //     this.context.getLanguageClient(editor.document.uri, "verilog");

    // Validate the first argument
    console.error('args', args);
    if (!args.path) {
      console.error('Invalid arguments provided to goToObjectDefinition');
      return;
    }

    let params: GoToObjectDefinitionParams = {
      path : args.path,
    };



    const result: GoToObjectDefinitionResult|undefined =
        await verilogClient.sendRequest('verilog/goToObjectDefinition', params);
    console.error('result', result);
    if (!result) {
      return;
    }
    if (result.length == 0) {
      return;
    }
    if (result.length == 1) {
      // Open the file.

      let documentUri = result[0].uri;
      if (typeof documentUri === 'string') {
        documentUri = vscode.Uri.parse(documentUri);
      }
      
      try {
        // Check if the document is already open in the workspace.
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document.uri.fsPath === documentUri.fsPath) {
            // Change the cursor to the location.
            editor.selection = new vscode.Selection(result[0].range.start, result[0].range.end);
            editor.revealRange(new vscode.Range(result[0].range.start, result[0].range.end), vscode.TextEditorRevealType.InCenter);
            return;
          }
        } 
          await vscode.window.showTextDocument(documentUri, {
            selection: new vscode.Range(result[0].range.start, result[0].range.end),
            viewColumn: vscode.ViewColumn.Beside
          });
      } catch (error) {
        console.error('Failed to open document:', error);
        vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
      }
    } else {
      // warn. 
      // Show multiple locations in a list.
      const locations = result.map(r => ({
        label: r.uri.fsPath,
        description: `${r.range.start.line + 1}:${r.range.start.character + 1} - ${r.range.end.line + 1}:${r.range.end.character + 1}`,
      }));
      const selectedLocation = await vscode.window.showQuickPick(locations, {
        placeHolder: 'Select a location to open',
      });
      if (!selectedLocation) {
        return;
      }
      const selectedLocationUri = vscode.Uri.parse(selectedLocation.label);

      vscode.window.showWarningMessage('Multiple locations found for object definition. Opening first location.');
      function parseLocation(location: string) {
        const [line, column] = location.split(':');
        return new vscode.Position(parseInt(line) - 1, parseInt(column) - 1);
      }
      const [start, end] = selectedLocation.description.split('-');
      await vscode.window.showTextDocument(selectedLocationUri, {
        selection: new vscode.Range(parseLocation(start),
          parseLocation(end)),
        viewColumn: vscode.ViewColumn.Beside
      });
    }


    return;
  }
}
