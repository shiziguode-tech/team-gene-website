<?php
$config['product_name'] = 'Team Gene 邮箱';
$config['skin_logo'] = [
    // 登录页：浅色背景用深色标志，深色模式用浅色标志
    'elastic:login'             => 'skins/elastic/images/team-gene-logo.svg',
    'elastic:login[small]'      => 'skins/elastic/images/team-gene-logo.svg',
    'elastic:login[dark]'       => 'skins/elastic/images/team-gene-logo-light.svg',
    'elastic:login[small-dark]' => 'skins/elastic/images/team-gene-logo-light.svg',
    // 其他页面：标志位于深绿色任务栏上
    'elastic:*'                 => 'skins/elastic/images/team-gene-mark.svg',
    'elastic:*[small]'          => 'skins/elastic/images/team-gene-mark.svg',
    'elastic:*[dark]'           => 'skins/elastic/images/team-gene-mark.svg',
    'elastic:*[small-dark]'     => 'skins/elastic/images/team-gene-mark.svg',
    '[print]'                   => 'skins/elastic/images/team-gene-logo.svg',
    '[favicon]'                 => 'skins/elastic/images/team-gene-favicon.svg',
];
