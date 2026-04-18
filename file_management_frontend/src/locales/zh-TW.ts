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
  filterBar: {
    labelFileName: '檔名',
    labelDateRange: '上傳時間',
    labelType: '檔案類型',
    labelEntry: '條目',
    labelTag: '標籤',
    fileNamePlaceholder: '檔名（包含）',
    createdFrom: '開始日期',
    createdTo: '結束日期',
    typePlaceholder: '檔案類型',
    typeAll: '全部類型',
    typeImage: '圖片',
    typeVideo: '影片',
    typeAudio: '音訊',
    typeDocument: '文件',
    typeOther: '其他',
    entryKindPlaceholder: '條目',
    entryAll: '全部',
    entryFile: '僅檔案',
    entryFolder: '僅資料夾',
    tagPlaceholder: '標籤',
    query: '查詢',
    reset: '重設條件'
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
    logs: '操作紀錄',
    transferRecords: '上傳/下載紀錄',
    adminDashboard: '管理員看板',
    images: '圖片',
    videos: '影片',
    audio: '音訊',
    documents: '文件',
    categories: '分類',
    contactsAndMessages: '通訊錄與訊息'
  },
  login: {
    title: '檔案管理系統',
    username: '使用者名稱',
    password: '密碼',
    login: '登入',
    register: '註冊',
    noAccount: '沒有帳號？去註冊',
    hasAccount: '已有帳號？去登入',
    forgotPassword: '忘記密碼？',
    forgotPasswordNeedUsername: '請先填寫使用者名稱'
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
      tags: '標籤',
      type: '類型',
      size: '大小',
      date: '修改日期',
      action: '操作'
    },
    typeCategory: {
      folder: '資料夾',
      image: '圖片',
      video: '影片',
      audio: '音訊',
      document: '文件',
      other: '其他'
    },
    action: {
      rename: '重新命名',
      move: '移動',
      delete: '刪除',
      download: '下載',
      history: '歷史紀錄'
    }
  },
  mediaPlayer: {
    restoredProgress: '已從上次位置繼續播放',
    audioNotSupported: '您的瀏覽器不支援 audio 標籤。',
    downloadWithExternal: '下載並使用本機播放器'
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
    all: '全部',
    selectedCount: '已選中 {count} 項',
    cancelSelection: '取消選擇',
    batchRestore: '批次還原',
    batchPermanentDelete: '批次徹底刪除',
    confirmBatchRestore: '確定將選中的 {count} 項還原嗎？',
    confirmBatchPermanent: '確定將選中的 {count} 項徹底刪除嗎？此操作無法復原！',
    restoredCountMsg: '已還原 {count} 項',
    permanentlyDeletedCountMsg: '已徹底刪除 {count} 項',
    header: {
      fileName: '檔名',
      tags: '標籤',
      size: '檔案大小',
      deletedAt: '刪除時間',
      action: '操作'
    }
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
  },
  transferRecords: {
    title: '上傳/下載紀錄',
    loadError: '載入紀錄失敗'
  },
  admin: {
    title: '系統管理控制台',
    backHome: '返回首頁',
    loadError: '載入統計資料失敗',
    loadErrorUnknown: '未知錯誤',
    cards: {
      totalUsers: '總使用者數',
      activeUsers: '活躍使用者',
      totalStorage: '總儲存使用',
      totalFiles: '檔案總數',
      adminCount: '管理員人數',
      systemStatus: '系統狀態',
      running: '執行中'
    },
    charts: {
      fileTypeDistribution: '檔案類型分布',
      storageRanking: '儲存使用排行 (Top 5)',
      storageAxisMB: '儲存使用 (MB)',
      pieSeriesName: '檔案類型',
      pieTooltip: '{b}: {c} 個 ({d}%)'
    },
    recentLogs: '最近操作紀錄',
    table: {
      time: '時間',
      user: '使用者',
      operationType: '操作類型',
      resourceType: '資源類型',
      description: '描述'
    },
    category: {
      image: '圖片',
      video: '影片',
      audio: '音訊',
      text: '文字'
    },
    docHint: {
      word: 'Word 文件',
      excel: 'Excel 試算表',
      ppt: 'PPT 簡報',
      archive: '壓縮檔'
    },
    mime: {
      image_png: 'PNG 圖片',
      image_jpeg: 'JPEG 圖片',
      image_gif: 'GIF 圖片',
      image_webp: 'WebP 圖片',
      image_svg_xml: 'SVG 圖片',
      image_bmp: 'BMP 圖片',
      video_mp4: 'MP4 影片',
      video_webm: 'WebM 影片',
      video_ogg: 'OGG 影片',
      video_quicktime: 'MOV 影片',
      video_x_msvideo: 'AVI 影片',
      video_x_matroska: 'MKV 影片',
      audio_mpeg: 'MP3 音訊',
      audio_ogg: 'OGG 音訊',
      audio_wav: 'WAV 音訊',
      audio_flac: 'FLAC 音訊',
      application_pdf: 'PDF 文件',
      application_msword: 'Word 文件',
      application_vnd_openxmlformats_officedocument_wordprocessingml_document: 'Word 文件',
      application_vnd_ms_excel: 'Excel 試算表',
      application_vnd_openxmlformats_officedocument_spreadsheetml_sheet: 'Excel 試算表',
      application_vnd_ms_powerpoint: 'PPT 簡報',
      application_vnd_openxmlformats_officedocument_presentationml_presentation: 'PPT 簡報',
      text_plain: '純文字',
      text_html: 'HTML 檔案',
      text_css: 'CSS 檔案',
      text_javascript: 'JavaScript',
      application_json: 'JSON 檔案',
      application_xml: 'XML 檔案',
      application_zip: 'ZIP 壓縮檔',
      application_x_rar_compressed: 'RAR 壓縮檔',
      application_x_7z_compressed: '7z 壓縮檔',
      application_gzip: 'GZ 壓縮檔'
    },
    userManagement: {
      title: '使用者管理',
      id: 'ID',
      username: '使用者名稱',
      email: '信箱',
      role: '角色',
      status: '狀態',
      storage: '儲存用量',
      createdAt: '註冊時間',
      actions: '操作',
      resetPassword: '重設密碼',
      active: '正常',
      disabled: '已停用',
      loadError: '載入使用者清單失敗',
      statusUpdated: '狀態已更新',
      resetSuccess: '密碼已重設',
      resetPromptTitle: '重設密碼',
      resetPromptPlaceholder: '新密碼（至少8位，含數字/大小寫/特殊字元中三種）',
      cannotDisableSelf: '不能停用自己的帳號',
      cannotDisableAdmin: '不能停用管理員帳號',
      syncFriends: '同步與主管理員好友',
      syncFriendsError: '同步好友失敗',
      roles: {
        admin: '管理員',
        user: '使用者',
        vip: '會員'
      }
    }
  },
  file: {
    move: {
      title: '移動到',
      selectFolderWarning: '請選擇目標資料夾',
      success: '移動成功',
      failed: '移動失敗'
    }
  },
  preview: {
    title: '文件預覽',
    downloading: '正在載入文件...',
    converting: '正在轉換文件，請稍候...',
    convertingHint: '首次預覽需要轉換為 PDF，之後將使用快取',
    error: '文件預覽失敗',
    loadFailed: '無法載入預覽內容',
    retry: '重試',
    downloadOriginal: '下載原始檔案',
    fullscreen: '全螢幕',
    exitFullscreen: '退出全螢幕'
  }
}
