<?php
// Run against the staged/patched vendor file, without a mailbox or web session:
// php -d memory_limit=12M tests/roundcube-attachment-stream.php /path/to/rcmail_attachment_handler.php
define('RCUBE_CHARSET', 'UTF-8');
$source = file_get_contents($argv[1]);
eval(preg_replace('/^<\?php\s*/', '', $source));

class rcube {
    public static $attachment;
    public static function get_instance() {
        return (object) ['plugins' => new class {
            public function exec_hook($name, $args) { return rcube::$attachment; }
        }];
    }
}

function handler($properties) {
    $reflection = new ReflectionClass('rcmail_attachment_handler');
    $handler = $reflection->newInstanceWithoutConstructor();
    foreach ($properties as $name => $value) {
        $reflection->getProperty($name)->setValue($handler, $value);
    }
    return $handler;
}

function capture_hash($callback) {
    $hash = hash_init('sha256');
    $bytes = 0;
    // Flush in chunks so the test itself does not buffer the entire attachment.
    ob_start(function ($chunk) use ($hash, &$bytes) {
        hash_update($hash, $chunk);
        $bytes += strlen($chunk);
        return '';
    }, 65536);
    try { $callback(); }
    finally { ob_end_flush(); }
    return [hash_final($hash), $bytes];
}

$path = tempnam(sys_get_temp_dir(), 'gene-stream-test-');
$small = tempnam(sys_get_temp_dir(), 'gene-stream-small-');
try {
    $file = fopen($path, 'wb');
    $chunk = str_repeat('0123456789abcdef', 4096);
    for ($index = 0; $index < 320; $index++) fwrite($file, $chunk);
    fclose($file);
    file_put_contents($small, $chunk);
    $size = filesize($path); // 20 MiB, larger than the test's 12 MiB memory limit.
    $expected = hash_file('sha256', $path);
    $partial = substr($chunk . $chunk, 0, 65545);
    $checks = 0;
    foreach (['body_file', 'upload'] as $mode) {
        rcube::$attachment = ['path' => $path, 'data' => ''];
        $properties = $mode === 'body_file' ? ['body_file' => $path] : ['upload' => ['id' => 'owned-test-attachment']];
        foreach ([0, null, 65545] as $limit) {
            [$hash, $bytes] = capture_hash(function () use ($properties, $limit) {
                handler($properties)->body($limit, -1);
            });
            if ($hash !== ($limit ? hash('sha256', $partial) : $expected) || $bytes !== ($limit ?: $size)) {
                throw new RuntimeException('Stream output mismatch: ' . $mode);
            }
            $checks++;
        }
        rcube::$attachment = ['path' => $small, 'data' => ''];
        $smallProperties = $mode === 'body_file' ? ['body_file' => $small] : ['upload' => ['id' => 'owned-small-test']];
        if (handler($smallProperties)->body(100, null) !== substr($chunk, 0, 100)) {
            throw new RuntimeException('Non-output body handling changed');
        }
        $checks++;
    }
    // Plugin-supplied data must keep taking priority over the local file.
    rcube::$attachment = ['path' => $path, 'data' => 'plugin-filtered-body'];
    [$hash, $bytes] = capture_hash(function () { handler(['upload' => ['id' => 'owned-test']])->body(0, -1); });
    if ($hash !== hash('sha256', 'plugin-filtered-body') || $bytes !== 20) throw new RuntimeException('Plugin data changed');
    $checks++;
    echo 'PASS: Roundcube attachment streaming, ' . $checks . ' cases; peak bytes=' . memory_get_peak_usage(true) . "\n";
}
finally {
    unlink($path);
    unlink($small);
}
