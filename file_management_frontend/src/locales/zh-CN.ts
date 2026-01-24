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
  recycleBin: {
    title: '回收站',
    empty: '清空回收站',
    searchPlaceholder: '搜索回收站文件',
    emptyState: '回收站为空',
    restore: '还原',
    permanentDelete: '彻底删除',
    confirmEmpty: '确定要清空回收站吗？所有文件将无法找回！',
    confirmDelete: '确定要彻底删除 "{name}" 吗？此操作无法撤销！'
  },
  logs: {
    title: '操作记录',
    searchPlaceholder: '搜索日志'
  }
}
