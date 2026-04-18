export default {
  common: {
    confirm: '确定',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    search: '搜索',
    loading: '加载中...',
    profile: '个人信息',
    settings: '设置',
    logout: '退出登录'
  },
  filterBar: {
    labelFileName: '文件名',
    labelDateRange: '上传时间',
    labelType: '文件类型',
    labelEntry: '条目',
    labelTag: '标签',
    fileNamePlaceholder: '文件名（包含）',
    createdFrom: '开始日期',
    createdTo: '结束日期',
    typePlaceholder: '文件类型',
    typeAll: '全部类型',
    typeImage: '图片',
    typeVideo: '视频',
    typeAudio: '音频',
    typeDocument: '文档',
    typeOther: '其他',
    entryKindPlaceholder: '条目',
    entryAll: '全部',
    entryFile: '仅文件',
    entryFolder: '仅文件夹',
    tagPlaceholder: '标签',
    query: '查询',
    reset: '重置条件'
  },
  theme: {
    light: '浅色模式',
    dark: '深色模式',
    auto: '跟随浏览器'
  },
  sidebar: {
    home: '首页',
    sync: '同步',
    favorites: '收藏',
    recycleBin: '回收站',
    logs: '操作记录',
    transferRecords: '上传/下载记录',
    adminDashboard: '管理员看板',
    images: '图片',
    videos: '视频',
    audio: '音频',
    documents: '文档',
    categories: '分类',
    contactsAndMessages: '通讯录与消息'
  },
  login: {
    title: '文件管理系统',
    username: '用户名',
    password: '密码',
    login: '登录',
    register: '注册',
    noAccount: '没有账号？去注册',
    hasAccount: '已有账号？去登录',
    forgotPassword: '忘记密码？',
    forgotPasswordNeedUsername: '请先填写用户名'
  },
  index: {
    toolbar: {
      all: '全部',
      list: '列表',
      grid: '网格'
    },
    searchPlaceholder: '搜索文件、文件夹',
    upload: {
      dragText: '拖拽文件到此处上传',
      button: '上传',
      success: '文件上传成功',
      fail: '文件上传失败'
    },
    createFolder: '新建文件夹',
    empty: '暂无文件',
    emptyHint: '拖拽文件到此处或点击上传按钮添加文件'
  },
  fileList: {
    header: {
      name: '名称',
      tags: '标签',
      type: '类型',
      size: '大小',
      date: '修改日期',
      action: '操作'
    },
    typeCategory: {
      folder: '文件夹',
      image: '图片',
      video: '视频',
      audio: '音频',
      document: '文档',
      other: '其他'
    },
    action: {
      rename: '重命名',
      move: '移动',
      delete: '删除',
      download: '下载',
      history: '历史记录'
    }
  },
  mediaPlayer: {
    restoredProgress: '已从上次位置继续播放',
    audioNotSupported: '您的浏览器不支持 audio 标签。',
    downloadWithExternal: '下载并使用本地播放器'
  },
  dialog: {
    createFolder: {
      title: '新建文件夹',
      label: '文件夹名称',
      placeholder: '请输入文件夹名称',
      success: '文件夹创建成功',
      fail: '文件夹创建失败'
    },
    rename: {
      title: '重命名',
      label: '新名称',
      placeholder: '请输入新名称',
      success: '重命名成功',
      fail: '重命名失败'
    },
    delete: {
      title: '删除文件',
      confirm: '确定要将 "{name}" 移入回收站吗？',
      success: '文件删除成功',
      fail: '文件删除失败'
    }
  },
  fileUpload: {
    uploadFile: '上传文件',
    uploading: '上传中...',
    dropZoneText: '拖拽文件到此处上传',
    dropZoneHint: '或点击上方按钮选择文件',
    queueTitle: '上传队列',
    clearQueue: '清空队列',
    start: '开始',
    pause: '暂停',
    resume: '继续',
    remove: '移除',
    statusWaiting: '等待上传',
    statusUploading: '上传中',
    statusPaused: '已暂停',
    statusCompleted: '上传完成',
    statusError: '上传失败',
    calculating: '计算中...',
    remaining: '剩余',
    maxFilesWarning: '最多只能同时上传 {max} 个文件',
    fileInQueue: '{name} 已在上传队列中',
    filesAdded: '已添加 {count} 个文件到上传队列',
    croppedImageAdded: '已添加裁剪后图片',
    instantUploadSuccess: '{name} 秒传成功',
    uploadSuccess: '{name} 上传成功',
    uploadError: '{name} 上传失败: {error}'
  },
  recycleBin: {
    title: '回收站',
    empty: '清空回收站',
    searchPlaceholder: '搜索文件',
    emptyState: '回收站为空',
    restore: '还原',
    permanentDelete: '彻底删除',
    confirmEmpty: '确定要清空回收站吗？此操作不可恢复！',
    confirmDelete: '确定要彻底删除此文件吗？此操作不可恢复！',
    all: '全部',
    selectedCount: '已选中 {count} 项',
    cancelSelection: '取消选择',
    batchRestore: '批量还原',
    batchPermanentDelete: '批量彻底删除',
    confirmBatchRestore: '确定将选中的 {count} 项还原到原位置吗？',
    confirmBatchPermanent: '确定将选中的 {count} 项彻底删除吗？此操作无法撤销！',
    restoredCountMsg: '已还原 {count} 项',
    permanentlyDeletedCountMsg: '已彻底删除 {count} 项',
    header: {
      fileName: '文件名',
      tags: '标签',
      size: '文件大小',
      deletedAt: '删除时间',
      action: '操作'
    }
  },
  logs: {
    title: '操作日志',
    searchPlaceholder: '搜索日志',
    operationType: '操作类型',
    dateRange: '日期范围',
    keyword: '关键词',
    userId: '用户ID',
    all: '全部',
    startDate: '开始日期',
    endDate: '结束日期',
    searchKeywordPlaceholder: '搜索文件名/描述',
    userIdPlaceholder: '输入用户ID',
    search: '查询',
    reset: '重置',
    loadError: '加载日志失败',
    operations: {
      UPLOAD: '上传',
      DOWNLOAD: '下载',
      DELETE: '删除',
      RESTORE: '还原',
      PERMANENT_DELETE: '彻底删除',
      RENAME: '重命名',
      MOVE: '移动',
      SHARE: '分享',
      LOGIN: '登录',
      REGISTER: '注册'
    },
    table: {
      id: 'ID',
      operator: '操作人',
      operationType: '操作类型',
      resourceType: '对象类型',
      description: '详细描述',
      ipAddress: 'IP地址',
      operationTime: '操作时间',
      unknown: 'Unknown'
    }
  },
  transferRecords: {
    title: '上传/下载记录',
    loadError: '加载记录失败'
  },
  admin: {
    title: '系统管理控制台',
    backHome: '返回首页',
    loadError: '加载统计数据失败',
    loadErrorUnknown: '未知错误',
    cards: {
      totalUsers: '总用户数',
      activeUsers: '活跃用户',
      totalStorage: '总存储使用',
      totalFiles: '文件总数',
      adminCount: '管理员人数',
      systemStatus: '系统状态',
      running: '运行中'
    },
    charts: {
      fileTypeDistribution: '文件类型分布',
      storageRanking: '存储使用排行 (Top 5)',
      storageAxisMB: '存储使用 (MB)',
      pieSeriesName: '文件类型',
      pieTooltip: '{b}: {c} 个 ({d}%)'
    },
    recentLogs: '最近操作日志',
    table: {
      time: '时间',
      user: '用户',
      operationType: '操作类型',
      resourceType: '资源类型',
      description: '描述'
    },
    category: {
      image: '图片',
      video: '视频',
      audio: '音频',
      text: '文本'
    },
    docHint: {
      word: 'Word 文档',
      excel: 'Excel 表格',
      ppt: 'PPT 演示',
      archive: '压缩包'
    },
    mime: {
      image_png: 'PNG 图片',
      image_jpeg: 'JPEG 图片',
      image_gif: 'GIF 图片',
      image_webp: 'WebP 图片',
      image_svg_xml: 'SVG 图片',
      image_bmp: 'BMP 图片',
      video_mp4: 'MP4 视频',
      video_webm: 'WebM 视频',
      video_ogg: 'OGG 视频',
      video_quicktime: 'MOV 视频',
      video_x_msvideo: 'AVI 视频',
      video_x_matroska: 'MKV 视频',
      audio_mpeg: 'MP3 音频',
      audio_ogg: 'OGG 音频',
      audio_wav: 'WAV 音频',
      audio_flac: 'FLAC 音频',
      application_pdf: 'PDF 文档',
      application_msword: 'Word 文档',
      application_vnd_openxmlformats_officedocument_wordprocessingml_document: 'Word 文档',
      application_vnd_ms_excel: 'Excel 表格',
      application_vnd_openxmlformats_officedocument_spreadsheetml_sheet: 'Excel 表格',
      application_vnd_ms_powerpoint: 'PPT 演示',
      application_vnd_openxmlformats_officedocument_presentationml_presentation: 'PPT 演示',
      text_plain: '纯文本',
      text_html: 'HTML 文件',
      text_css: 'CSS 文件',
      text_javascript: 'JavaScript',
      application_json: 'JSON 文件',
      application_xml: 'XML 文件',
      application_zip: 'ZIP 压缩包',
      application_x_rar_compressed: 'RAR 压缩包',
      application_x_7z_compressed: '7z 压缩包',
      application_gzip: 'GZ 压缩包'
    },
    userManagement: {
      title: '用户管理',
      id: 'ID',
      username: '用户名',
      email: '邮箱',
      role: '角色',
      status: '状态',
      storage: '存储用量',
      createdAt: '注册时间',
      actions: '操作',
      resetPassword: '重置密码',
      active: '正常',
      disabled: '已禁用',
      loadError: '加载用户列表失败',
      statusUpdated: '状态已更新',
      resetSuccess: '密码已重置',
      resetPromptTitle: '重置密码',
      resetPromptPlaceholder: '新密码（至少8位，含数字/大小写/特殊字符中三种）',
      cannotDisableSelf: '不能禁用自己的账号',
      cannotDisableAdmin: '不能禁用管理员账号',
      syncFriends: '同步与主管理员好友',
      syncFriendsError: '同步好友失败',
      roles: {
        admin: '管理员',
        user: '用户',
        vip: '会员'
      }
    }
  },
  file: {
    move: {
      title: '移动到',
      selectFolderWarning: '请选择目标文件夹',
      success: '移动成功',
      failed: '移动失败'
    }
  },
  preview: {
    title: '文档预览',
    downloading: '正在加载文档...',
    converting: '正在转换文档，请稍候...',
    convertingHint: '首次预览需要转换为 PDF，后续将使用缓存',
    error: '文档预览失败',
    loadFailed: '无法加载预览内容',
    retry: '重试',
    downloadOriginal: '下载原文件',
    fullscreen: '全屏',
    exitFullscreen: '退出全屏'
  }
}
