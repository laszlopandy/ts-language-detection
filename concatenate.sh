COMPILER_PATH="./node_modules/google-closure-compiler/compiler.jar"
entryPoint=$1;
outputFile=$2;

echo "Entry point: $entryPoint"
echo "Output: $outputFile"

java -jar $COMPILER_PATH \
    --process_common_js_modules \
    --module_resolution NODE \
    --dependency_mode STRICT \
    --compilation_level SIMPLE \
    --isolation_mode IIFE \
    --language_in ECMASCRIPT5_STRICT \
    --language_out ECMASCRIPT5_STRICT \
    --entry_point $entryPoint \
    --js_output_file $outputFile \
    --js 'build/ts/**.js'
