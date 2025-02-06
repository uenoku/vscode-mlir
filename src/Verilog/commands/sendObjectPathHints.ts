import * as vscode from 'vscode'

import {Command} from '../../command';
import {MLIRContext} from '../../mlirContext';
import { assert } from 'console';

/**
 * The parameters to the verilog/viewOutput command. These parameters are:
 * - `uri`: The URI of the file to view.
 * - `kind`: The kind of the output to generate.
 */
type ObjectPathAndValue = Partial<{path : string, value : string}>;
type SendObjectPathHintsParams = Partial<{values : ObjectPathAndValue[]}>;

/**
 * The output of the commands:
 * - `output`: The output string of the command, e.g. a .mlir PDL string.
 */
// No output.
type SendObjectPathHintsResult = Partial<{}>;

/**
 * A command that displays the output of the current Verilog document.
 */
export class SendObjectPathHintsCommand extends Command {
  constructor(context: MLIRContext) { super('circt-verilog-lsp.objectPathInlayHints', context); }

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
      vscode.window.showWarningMessage(
        "No verilog language client found. Please open a (random) verilog file along with waveform first if you want to use circt-verilog-lsp integration."
      );
      return;
    }

    // Check to see if a language client is active for this document.
    // const verilogClient =
    //     this.context.getLanguageClient(editor.document.uri, "verilog");
   
    // const params: SendObjectPathHintsParams = {
    //   values : [{path : 'tb.clk', value : '0x1234'}],
    // };
      // Type guard to validate the argument structure
    // function isValidArg(arg: any): arg is { values: ObjectPathAndValue[] } {
    //   return arg && Array.isArray(arg.values) && arg.values.every(v => 
    //     typeof v.path === 'string' && typeof v.value === 'string'
    //   );
    // }

    // Validate the first argument
    if (!args.values) {
      console.error('Invalid arguments provided to sendObjectPathHints');
      return;
    }

    let params: SendObjectPathHintsParams = {
      values : args.values || [],
    };



    const result: SendObjectPathHintsResult|undefined =
        await verilogClient.sendRequest('verilog/objectPathInlayHints', params);
    if (!result) {
      return;
    }


    return result;
  }
}
