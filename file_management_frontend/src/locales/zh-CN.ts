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
    logs: '操作记录'
  },
  login: {
    title: '文件管理系统',
    username: '用户名',
    password: '密码',
    login: '登录',
    register: '注册',
    noAccount: '没有账号？去注册',
    hasAccount: '已有账号？去登录'
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
      size: '大小',
      date: '修改日期',
      action: '操作'
    },
    action: {
      rename: '重命名',
      move: '移动',
      delete: '删除',
      download: '下载'
    }
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
    all: '全部'
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
  }
  ,
  file: {
    move: {
      title: '移动到',
      selectFolderWarning: '请选择目标文件夹',
      success: '移动成功',
      failed: '移动失败'
    }
  }
}
