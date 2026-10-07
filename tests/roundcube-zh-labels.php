<?php
// Checks the Chinese texts that team_gene_avatar adds to Roundcube 1.6.
// usage: php tests/roundcube-zh-labels.php webmail/roundcube
// Isolated: reads localization files and runs the plugin init against a stub.
namespace TeamGeneZhLabelsTest;

$root = rtrim($argv[1] ?? 'webmail/roundcube', '/');
$failures = [];
$check = function ($ok, $message) use (&$failures) { if (!$ok) $failures[] = $message; };

function texts($file) {
    $labels = $messages = [];
    include $file;
    return $labels + $messages;
}
$english = texts("$root/program/localization/en_US/labels.inc") + texts("$root/program/localization/en_US/messages.inc");
$chinese = texts("$root/program/localization/zh_CN/labels.inc") + texts("$root/program/localization/zh_CN/messages.inc");
$added = texts("$root/plugins/team_gene_avatar/localization/zh_CN.inc");

$check(count($added) >= 50, 'expected the missing labels and messages, found ' . count($added));
foreach ($added as $key => $text) {
    $check(isset($english[$key]), "$key is not a Roundcube text");
    $check(!isset($chinese[$key]), "$key already has a Chinese translation; do not override it");
    $check(!preg_match('/[A-Za-z]{4,}/', preg_replace('/<[^>]+>|\$\w+|Mailvelope|OAuth|Cookie|Mbox|MIME|vCard|CSV|Bcc|zip/', '', $text)), "$key still reads as English: $text");
    // placeholders must survive translation
    preg_match_all('/\$\w+/', $english[$key] ?? '', $wanted);
    foreach ($wanted[0] as $placeholder) $check(strpos($text, $placeholder) !== false, "$key lost $placeholder");
}
foreach (['darkmode', 'lightmode', 'details', 'keepformatting', 'collectedrecipients', 'trustedsenders', 'loggedout'] as $visible) {
    $check(isset($added[$visible]), "$visible is visible in the interface and must be translated");
}

// The plugin merges the texts for zh_CN sessions only, before any user check.
class rcube_plugin {
    public function register_action($name, $callback) {}
    public function add_hook($name, $callback) {}
    public function include_script($name) {}
    public function include_stylesheet($name) {}
}
class rcmail {
    public static $instance;
    public $user = null;
    public $merged = null;
    public static function get_instance() { return self::$instance; }
    public function load_language($lang = null, $add = [], $merge = []) { $this->merged = $merge; }
}
$plugin = "$root/plugins/team_gene_avatar/team_gene_avatar.php";
$source = str_replace('__DIR__', var_export(dirname(realpath($plugin)), true), file_get_contents($plugin));
eval('namespace TeamGeneZhLabelsTest;' . preg_replace('/^<\?php\s*/', '', $source));

foreach (['zh_CN' => true, 'zh_TW' => false, 'en_US' => false] as $language => $expected) {
    $_SESSION['language'] = $language;
    rcmail::$instance = new rcmail();
    (new team_gene_avatar())->init();
    $merged = rcmail::$instance->merged;
    $check($expected ? ($merged['darkmode'] ?? '') === '深色模式' && count($merged) === count($added) : $merged === null, "$language merge");
}
$reflection = new \ReflectionProperty(team_gene_avatar::class, 'task');
$check(preg_match('/^(?:' . $reflection->getValue(new team_gene_avatar()) . ')$/', 'login') === 1, 'the sign-out notice needs the login task');

if ($failures) { fwrite(STDERR, "FAIL:\n  " . implode("\n  ", $failures) . "\n"); exit(1); }
echo 'PASS: Roundcube Chinese texts, ' . count($added) . " entries\n";
