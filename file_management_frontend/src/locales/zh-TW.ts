export default {
  common: {
    confirm: '確定',
    cancel: '取消',
    save: '儲存',
    delete: '刪除',
    edit: '編輯',
    search: '搜尋',
    loading: '載入中...',
    profile: '個人信息',
    settings: '設置',
    logout: '退出登錄'
  },
  theme: {
    light: '淺色模式',
    dark: '深色模式',
    auto: '跟隨瀏覽器'
  },
  sidebar: {
    home: '首頁',
    sync: '同步',
    favorites: '收藏',
    recycleBin: '回收筒',
    logs: '操作紀錄'
  },
  login: {
    title: '檔案管理系統',
    username: '使用者名稱',
    password: '密碼',
    login: '登入',
    register: '註冊',
    noAccount: '沒有帳號？去註冊',
    hasAccount: '已有帳號？去登入'
  },
  index: {
    toolbar: {
      all: '全部',
      list: '列表',
      grid: '網格'
    },
    searchPlaceholder: '搜尋檔案、資料夾',
    upload: {
      dragText: '拖曳檔案到此處上傳',
      button: '上傳',
      success: '檔案上傳成功',
      fail: '檔案上傳失敗'
    },
    createFolder: '新建資料夾',
    empty: '暫無檔案',
    emptyHint: '拖曳檔案到此處或點擊上傳按鈕新增檔案'
  },
  fileList: {
    header: {
      name: '名稱',
      size: '大小',
      date: '修改日期',
      action: '操作'
    },
    action: {
      rename: '重新命名',
      move: '移動',
      delete: '刪除',
      download: '下載'
    }
  },
  dialog: {
    createFolder: {
      title: '新建資料夾',
      label: '資料夾名稱',
      placeholder: '請輸入資料夾名稱',
      success: '資料夾建立成功',
      fail: '資料夾建立失敗'
    },
    rename: {
      title: '重新命名',
      label: '新名稱',
      placeholder: '請輸入新名稱',
      success: '重新命名成功',
      fail: '重新命名失敗'
    },
    delete: {
      title: '刪除檔案',
      confirm: '確定要將 "{name}" 移入回收筒嗎？',
      success: '檔案刪除成功',
      fail: '檔案刪除失敗'
    }
  },
  fileUpload: {
    uploadFile: '上傳檔案',
    uploading: '上傳中...',
    dropZoneText: '拖曳檔案到此處上傳',
    dropZoneHint: '或點擊上方按鈕選擇檔案',
    queueTitle: '上傳佇列',
    clearQueue: '清空佇列',
    start: '開始',
    pause: '暫停',
    resume: '繼續',
    remove: '移除',
    statusWaiting: '等待上傳',
    statusUploading: '上傳中',
    statusPaused: '已暫停',
    statusCompleted: '上傳完成',
    statusError: '上傳失敗',
    calculating: '計算中...',
    remaining: '剩餘',
    maxFilesWarning: '最多只能同時上傳 {max} 個檔案',
    fileInQueue: '{name} 已在上傳佇列中',
    filesAdded: '已添加 {count} 個檔案到上傳佇列',
    croppedImageAdded: '已添加裁剪後圖片',
    instantUploadSuccess: '{name} 秒傳成功',
    uploadSuccess: '{name} 上傳成功',
    uploadError: '{name} 上傳失敗: {error}'
  },
  recycleBin: {
    title: '回收筒',
    empty: '清空回收筒',
    searchPlaceholder: '搜尋回收筒檔案',
    emptyState: '回收筒為空',
    restore: '還原',
    permanentDelete: '徹底刪除',
    confirmEmpty: '確定要清空回收筒嗎？所有檔案將無法找回！',
    confirmDelete: '確定要徹底刪除 "{name}" 嗎？此操作無法撤銷！',
    all: '全部'
  },
  logs: {
    title: '操作紀錄',
    searchPlaceholder: '搜尋日誌',
    operationType: '操作類型',
    dateRange: '日期範圍',
    keyword: '關鍵詞',
    userId: '用戶ID',
    all: '全部',
    startDate: '開始日期',
    endDate: '結束日期',
    searchKeywordPlaceholder: '搜尋檔案名/描述',
    userIdPlaceholder: '輸入用戶ID',
    search: '查詢',
    reset: '重置',
    loadError: '載入日誌失敗',
    operations: {
      UPLOAD: '上傳',
      DOWNLOAD: '下載',
      DELETE: '刪除',
      RESTORE: '還原',
      PERMANENT_DELETE: '徹底刪除',
      RENAME: '重新命名',
      MOVE: '移動',
      SHARE: '分享',
      LOGIN: '登入',
      REGISTER: '註冊'
    },
    table: {
      id: 'ID',
      operator: '操作人',
      operationType: '操作類型',
      resourceType: '對象類型',
      description: '詳細描述',
      ipAddress: 'IP地址',
      operationTime: '操作時間',
      unknown: '未知'
    }
  }
}
