<?php
// Isolated Roundcube API stub. No credentials, network, or live mailbox access.
namespace TeamGeneAvatarTransferTest;

function file_get_contents($path) { return false; }
function mb_substr($text, $offset, $length) { return substr($text, $offset, $length); }

class rcube_plugin {
    public function register_action($name, $callback) {}
    public function add_hook($name, $callback) {}
    public function include_script($name) {}
    public function include_stylesheet($name) {}
}
class rcube_utils {
    const INPUT_GPC = 0;
    public static function get_input_value($name, $mode) { return $_GET[$name] ?? null; }
}
class rcmail {
    public static $instance;
    public static function get_instance() { return self::$instance; }
}

// Read the passed-in source without the stub, and evaluate it in this isolated
// namespace so credential loading is intercepted above.
$source = \file_get_contents($argv[1]);
eval('namespace TeamGeneAvatarTransferTest;' . preg_replace('/^<\?php\s*/', '', $source));

$cases = [
    ['', null, true],
    ['compose', null, true],
    ['preferences', null, true],
    ['get', null, false],
    ['upload', null, false],
    ['send', null, false],
    ['keep-alive', null, false],
    ['refresh', null, false],
    ['list', '1', false],
    ['plugin.gene-avatar-save', null, false],
    ['plugin.gene-avatar-status', null, false],
];
foreach ($cases as [$action, $remote, $shouldRender]) {
    $_GET = $remote === null ? [] : ['_remote' => $remote];
    $output = new class {
        public $env = [];
        public function set_env($key, $value) { $this->env[$key] = $value; }
    };
    rcmail::$instance = (object) [
        'action' => $action,
        'output' => $output,
        'user' => new class {
            public $ID = 1;
            public function get_username($part = null) { return 'tester'; }
        },
    ];
    (new team_gene_avatar())->init();
    if (isset($output->env['gene_avatar_initial']) !== $shouldRender) {
        throw new \RuntimeException('Avatar lookup policy failed: ' . $action);
    }
}
echo 'PASS: Roundcube avatar bridge routing, ' . count($cases) . " cases\n";
