# CIRCT-Verilog-LSP

The CIRCT-Verilog-LSP provides language IDE features for Verilog and SystemVerilog.
CIRCT-Verilog-LSP is built on top of the [Slang](https://github.com/MikePopoloski/slang) and MLIR LSP library.

## `.verilog` - (System) Verilog:


### Features

- Syntax highlighting for `.v` and `.sv` files and markdown blocks
- go-to-definition and cross references
- Cross reference CIRCT emitted locations 
- User providable inlay hints
- Detailed information when hovering over variables
- ImportVerilog integration
- *[Requires MLIR file]* Waveform viewer (surfer) integration

### Configuration

* For the basic features, only the `circt-verilog-lsp.verilog_server_path` setting is required. Set this to the path of the `circt-verilog-lsp` executable.

* To cross reference CIRCT emitted locations, the `circt-verilog-lsp.verilog_source_location_root_directories` setting is required. For example, chisel user could set this to the path of the directory containing the chisel sources.


* For the waveform viewer integration, MLIR file and include directories settings are required. Easiest way to configure these is to set `circt-verilog-lsp.verilog_design_root_directory` to the root directory which contains a `mlir` file and verilog files. The option recursively includes a `mlir` file and verilog files in the directory. It causes an error if there are multiple `mlir` files in the directory so configure `circt-verilog-lsp.verilog_mlir_file` in that case.

* The language server automatically includes files in the same directory as the file being edited. To manually include additional RTL directories, use the `circt-verilog-lsp.verilog_include_directories` setting.

* MLIR file can be passed to the language server via the `circt-verilog-lsp.verilog_mlir_file` setting.

#### Diagnostics

The language server runs diagnostics ran by slang.

##### Find definition

Jump to the definition of symbol under the cursor. For variables it jumps to the declaration. For module instantiation, it jumps to the module definition.

#### Cross-references to CIRCT emitted locations

CIRCT emits location information `@[loc]` in the SV. CIRCT-Verilog-LSP can navigate to these locations. It's necessary to configure the `circt-verilog-lsp.verilog_source_location_root_directories` setting to the root directory of the design.

#### Hover

Hover over an verilog files see more information about it.  For symbols, type information and definition location is shown. For source locations, original file content is shown.

#### ImportVerilog Integration

The language server is shipped with ImportVerilog pipeline.
To run ImportVerilog pipelne, use `circt-verilog-lsp.viewOutput` command.


#### Waveform viewer integration

The language server has integration with (currently locally modified) Surfer.
Surfer extension is required to be installed. In addition to that the LSP requires entire instance graph, so currenly MLIR file is required. See Configuration section for more details.

After that, selecting variable in surfer will open corresponding verilog file with the variable highlighted.
