<?php
class team_gene_avatar extends rcube_plugin
{
    // login/logout only load the Chinese texts below (the sign-out notice).
    public $task = 'mail|settings|addressbook|login|logout';

    public function init()
    {
        $rc = rcmail::get_instance();
        // Roundcube 1.6's zh_CN translation lacks ~60 newer texts, which then
        // showed in English. Merge them over the English fallback.
        if (($_SESSION['language'] ?? '') === 'zh_CN') {
            $labels = $messages = [];
            include __DIR__ . '/localization/zh_CN.inc';
            $rc->load_language(null, [], $labels + $messages);
        }
        if (!$rc->user || !$rc->user->ID) return;
        $this->register_action('plugin.gene-avatar-save', [$this, 'save']);
        $this->register_action('plugin.gene-avatar-status', [$this, 'status']);
        $this->add_hook('preferences_sections_list', [$this, 'sections']);
        $this->add_hook('preferences_list', [$this, 'preferences']);
        $this->include_script('avatar.js?v=20261001-mail');
        $this->include_stylesheet('avatar.css');
        // Download/upload/poll requests do not render the account menu. Avoid a
        // second application request on every attachment and background poll.
        $remote = rcube_utils::get_input_value('_remote', rcube_utils::INPUT_GPC);
        $file_action = in_array($rc->action, ['get', 'upload', 'download', 'send', 'save', 'keep-alive', 'refresh'], true);
        if (!$remote && !$file_action && strpos($rc->action, 'plugin.gene-avatar-') !== 0) {
            $result = $this->bridge('GET');
            $rc->output->set_env('gene_avatar_url', $result['avatarUrl'] ?? null);
            $rc->output->set_env('gene_avatar_initial', mb_substr($rc->user->get_username('local'), 0, 1));
        }
    }

    public function sections($args)
    {
        $args['list']['gene_avatar'] = ['id'=>'gene_avatar', 'section'=>'个人头像'];
        return $args;
    }

    public function preferences($args)
    {
        if ($args['section'] === 'gene_avatar') {
            $args['blocks']['avatar'] = ['name'=>'邮箱与论坛头像', 'content'=>$this->editor()];
        }
        return $args;
    }

    private function editor()
    {
        return '<div class="gene-avatar-editor"><div class="gene-avatar-preview" aria-label="当前头像"></div>'
            . '<p>与 Team Gene 论坛同步。图片最大 50 MB，保存时自动居中裁成方形，圆形显示。</p>'
            . '<label class="gene-avatar-upload">上传 / 更换头像<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" class="gene-avatar-file"></label>'
            . '<button type="button" class="gene-avatar-remove">恢复默认</button>'
            . '<progress class="gene-avatar-progress" max="100" value="0" hidden></progress>'
            . '<p class="gene-avatar-status" role="status" aria-live="polite"></p></div>';
    }

    private function bridge($method, $file = null)
    {
        $secret = @file_get_contents('/etc/roundcube/team-gene-avatar.key');
        if (!$secret) return ['error'=>'头像服务暂未就绪，请稍后重试。'];
        $email = strtolower(rcmail::get_instance()->user->get_username());
        $headers = ['X-Team-Gene-Avatar-Token: '.trim($secret), 'X-Team-Gene-Avatar-User: '.$email];
        $ch = curl_init('http://127.0.0.1:3000/api/internal/mail-avatar');
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>2, CURLOPT_TIMEOUT=>30, CURLOPT_CUSTOMREQUEST=>$method, CURLOPT_PROXY=>'']);
        $handle = null;
        if ($file) {
            $handle = fopen($file['tmp_name'], 'rb');
            $headers[] = 'Content-Type: '.(new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
            $headers[] = 'Content-Length: '.$file['size'];
            $headers[] = 'Expect:';
            curl_setopt_array($ch, [CURLOPT_UPLOAD=>true, CURLOPT_CUSTOMREQUEST=>'POST', CURLOPT_INFILE=>$handle, CURLOPT_INFILESIZE=>$file['size']]);
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        $response = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($handle) fclose($handle);
        $result = $response ? json_decode($response, true) : null;
        if (!is_array($result)) return ['error'=>'头像服务暂时无法连接，请稍后重试。'];
        if ($code !== 200) return ['error'=>$result['error'] ?? '头像保存失败。'];
        $url = $result['avatarUrl'] ?? null;
        return ['avatarUrl'=>$url && preg_match('#^/api/avatars/[a-f0-9-]{36}$#', $url) ? 'https://team-gene.com'.$url : null];
    }

    private function reply($data, $status = 200)
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public function status()
    {
        $this->reply($this->bridge('GET'));
    }

    public function save()
    {
        $rc = rcmail::get_instance();
        // Require the explicit session token, including for an empty/malformed POST.
        $token = rcube_utils::get_input_value('_token', rcube_utils::INPUT_POST);
        if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !is_string($token) || !hash_equals($rc->get_request_token(), $token)) {
            $this->reply(['error'=>'登录已失效，请刷新页面后重试。'], 403);
        }
        if (rcube_utils::get_input_value('_remove', rcube_utils::INPUT_POST) === '1') {
            $result = $this->bridge('DELETE');
        } else {
            $file = $_FILES['_avatar'] ?? null;
            if (!$file || $file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) $this->reply(['error'=>'图片未完整上传，请重新选择。'], 400);
            if ($file['size'] < 1 || $file['size'] > 50 * 1024 * 1024) $this->reply(['error'=>'头像图片不能为空，最大 50 MB。'], 413);
            $result = $this->bridge('POST', $file);
        }
        $this->reply($result, isset($result['error']) ? 400 : 200);
    }
}
