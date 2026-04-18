export default {
  common: {
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    search: 'Search',
    loading: 'Loading...',
    profile: 'Profile',
    settings: 'Settings',
    logout: 'Logout'
  },
  filterBar: {
    labelFileName: 'Name',
    labelDateRange: 'Upload time',
    labelType: 'Type',
    labelEntry: 'Entry',
    labelTag: 'Tag',
    fileNamePlaceholder: 'File name (contains)',
    createdFrom: 'Start date',
    createdTo: 'End date',
    typePlaceholder: 'File type',
    typeAll: 'All types',
    typeImage: 'Images',
    typeVideo: 'Videos',
    typeAudio: 'Audio',
    typeDocument: 'Documents',
    typeOther: 'Other',
    entryKindPlaceholder: 'Entry',
    entryAll: 'All',
    entryFile: 'Files only',
    entryFolder: 'Folders only',
    tagPlaceholder: 'Tag',
    query: 'Search',
    reset: 'Reset'
  },
  theme: {
    light: 'Light Mode',
    dark: 'Dark Mode',
    auto: 'Follow System'
  },
  sidebar: {
    home: 'Home',
    sync: 'Sync',
    favorites: 'Favorites',
    recycleBin: 'Recycle Bin',
    logs: 'Logs',
    transferRecords: 'Upload / Download History',
    adminDashboard: 'Admin Dashboard',
    images: 'Images',
    videos: 'Videos',
    audio: 'Audio',
    documents: 'Documents',
    categories: 'Categories',
    contactsAndMessages: 'Contacts & Messages'
  },
  login: {
    title: 'File Management',
    username: 'Username',
    password: 'Password',
    login: 'Login',
    register: 'Register',
    noAccount: 'No account? Register',
    hasAccount: 'Has account? Login',
    forgotPassword: 'Forgot password?',
    forgotPasswordNeedUsername: 'Please enter your username first'
  },
  index: {
    toolbar: {
      all: 'All',
      list: 'List',
      grid: 'Grid'
    },
    searchPlaceholder: 'Search files, folders',
    upload: {
      dragText: 'Drag files here to upload',
      button: 'Upload',
      success: 'Upload success',
      fail: 'Upload failed'
    },
    createFolder: 'New Folder',
    empty: 'No files',
    emptyHint: 'Drag files here or click upload button'
  },
  fileList: {
    header: {
      name: 'Name',
      tags: 'Tags',
      type: 'Type',
      size: 'Size',
      date: 'Date Modified',
      action: 'Actions'
    },
    typeCategory: {
      folder: 'Folder',
      image: 'Image',
      video: 'Video',
      audio: 'Audio',
      document: 'Document',
      other: 'Other'
    },
    action: {
      rename: 'Rename',
      move: 'Move',
      delete: 'Delete',
      download: 'Download',
      history: 'History'
    }
  },
  mediaPlayer: {
    restoredProgress: 'Resumed from last position',
    audioNotSupported: 'Your browser does not support the audio element.',
    downloadWithExternal: 'Download and open externally'
  },
  dialog: {
    createFolder: {
      title: 'New Folder',
      label: 'Folder Name',
      placeholder: 'Enter folder name',
      success: 'Folder created',
      fail: 'Failed to create folder'
    },
    rename: {
      title: 'Rename',
      label: 'New Name',
      placeholder: 'Enter new name',
      success: 'Rename success',
      fail: 'Rename failed'
    },
    delete: {
      title: 'Delete File',
      confirm: 'Are you sure you want to move "{name}" to Recycle Bin?',
      success: 'Delete success',
      fail: 'Delete failed'
    }
  },
  fileUpload: {
    uploadFile: 'Upload File',
    uploading: 'Uploading...',
    dropZoneText: 'Drop files here to upload',
    dropZoneHint: 'Or click the button above to select files',
    queueTitle: 'Upload Queue',
    clearQueue: 'Clear Queue',
    start: 'Start',
    pause: 'Pause',
    resume: 'Resume',
    remove: 'Remove',
    statusWaiting: 'Waiting',
    statusUploading: 'Uploading',
    statusPaused: 'Paused',
    statusCompleted: 'Completed',
    statusError: 'Failed',
    calculating: 'Calculating...',
    remaining: 'Remaining',
    maxFilesWarning: 'Maximum {max} files can be uploaded at once',
    fileInQueue: '{name} is already in the upload queue',
    filesAdded: 'Added {count} file(s) to upload queue',
    croppedImageAdded: 'Cropped image added',
    instantUploadSuccess: '{name} instant upload successful',
    uploadSuccess: '{name} uploaded successfully',
    uploadError: '{name} upload failed: {error}'
  },
  recycleBin: {
    title: 'Recycle Bin',
    empty: 'Empty Recycle Bin',
    searchPlaceholder: 'Search files',
    emptyState: 'Recycle bin is empty',
    restore: 'Restore',
    permanentDelete: 'Delete Permanently',
    confirmEmpty: 'Are you sure you want to empty the recycle bin? This action cannot be undone!',
    confirmDelete: 'Are you sure you want to permanently delete this file? This action cannot be undone!',
    all: 'All',
    selectedCount: '{count} selected',
    cancelSelection: 'Clear selection',
    batchRestore: 'Restore selected',
    batchPermanentDelete: 'Delete permanently',
    confirmBatchRestore: 'Restore {count} selected item(s)?',
    confirmBatchPermanent: 'Permanently delete {count} selected item(s)? This cannot be undone.',
    restoredCountMsg: 'Restored {count} item(s)',
    permanentlyDeletedCountMsg: 'Permanently deleted {count} item(s)',
    header: {
      fileName: 'Name',
      tags: 'Tags',
      size: 'Size',
      deletedAt: 'Deleted at',
      action: 'Actions'
    }
  },
  logs: {
    title: 'Operation Logs',
    searchPlaceholder: 'Search logs',
    operationType: 'Operation Type',
    dateRange: 'Date Range',
    keyword: 'Keyword',
    userId: 'User ID',
    all: 'All',
    startDate: 'Start Date',
    endDate: 'End Date',
    searchKeywordPlaceholder: 'Search filename/description',
    userIdPlaceholder: 'Enter user ID',
    search: 'Search',
    reset: 'Reset',
    loadError: 'Failed to load logs',
    operations: {
      UPLOAD: 'Upload',
      DOWNLOAD: 'Download',
      DELETE: 'Delete',
      RESTORE: 'Restore',
      PERMANENT_DELETE: 'Permanent Delete',
      RENAME: 'Rename',
      MOVE: 'Move',
      SHARE: 'Share',
      LOGIN: 'Login',
      REGISTER: 'Register'
    },
    table: {
      id: 'ID',
      operator: 'Operator',
      operationType: 'Operation Type',
      resourceType: 'Resource Type',
      description: 'Description',
      ipAddress: 'IP Address',
      operationTime: 'Operation Time',
      unknown: 'Unknown'
    }
  },
  transferRecords: {
    title: 'Upload / Download History',
    loadError: 'Failed to load records'
  },
  admin: {
    title: 'Admin Console',
    backHome: 'Back to Home',
    loadError: 'Failed to load dashboard statistics',
    loadErrorUnknown: 'Unknown error',
    cards: {
      totalUsers: 'Total users',
      activeUsers: 'Active users',
      totalStorage: 'Total storage used',
      totalFiles: 'Total files',
      adminCount: 'Administrators',
      systemStatus: 'System status',
      running: 'Running'
    },
    charts: {
      fileTypeDistribution: 'File type distribution',
      storageRanking: 'Storage usage (Top 5)',
      storageAxisMB: 'Storage (MB)',
      pieSeriesName: 'File types',
      pieTooltip: '{b}: {c} ({d}%)'
    },
    recentLogs: 'Recent activity',
    table: {
      time: 'Time',
      user: 'User',
      operationType: 'Operation',
      resourceType: 'Resource',
      description: 'Description'
    },
    category: {
      image: 'Image',
      video: 'Video',
      audio: 'Audio',
      text: 'Text'
    },
    docHint: {
      word: 'Word',
      excel: 'Excel',
      ppt: 'PowerPoint',
      archive: 'Archive'
    },
    mime: {
      image_png: 'PNG image',
      image_jpeg: 'JPEG image',
      image_gif: 'GIF image',
      image_webp: 'WebP image',
      image_svg_xml: 'SVG image',
      image_bmp: 'BMP image',
      video_mp4: 'MP4 video',
      video_webm: 'WebM video',
      video_ogg: 'OGG video',
      video_quicktime: 'MOV video',
      video_x_msvideo: 'AVI video',
      video_x_matroska: 'MKV video',
      audio_mpeg: 'MP3 audio',
      audio_ogg: 'OGG audio',
      audio_wav: 'WAV audio',
      audio_flac: 'FLAC audio',
      application_pdf: 'PDF',
      application_msword: 'Word document',
      application_vnd_openxmlformats_officedocument_wordprocessingml_document: 'Word document',
      application_vnd_ms_excel: 'Excel spreadsheet',
      application_vnd_openxmlformats_officedocument_spreadsheetml_sheet: 'Excel spreadsheet',
      application_vnd_ms_powerpoint: 'PowerPoint',
      application_vnd_openxmlformats_officedocument_presentationml_presentation: 'PowerPoint',
      text_plain: 'Plain text',
      text_html: 'HTML',
      text_css: 'CSS',
      text_javascript: 'JavaScript',
      application_json: 'JSON',
      application_xml: 'XML',
      application_zip: 'ZIP archive',
      application_x_rar_compressed: 'RAR archive',
      application_x_7z_compressed: '7z archive',
      application_gzip: 'Gzip archive'
    },
    userManagement: {
      title: 'User management',
      id: 'ID',
      username: 'Username',
      email: 'Email',
      role: 'Role',
      status: 'Status',
      storage: 'Storage',
      createdAt: 'Registered',
      actions: 'Actions',
      resetPassword: 'Reset password',
      active: 'Active',
      disabled: 'Disabled',
      loadError: 'Failed to load users',
      statusUpdated: 'Status updated',
      resetSuccess: 'Password has been reset',
      resetPromptTitle: 'Reset password',
      resetPromptPlaceholder: 'New password (min 8 chars, 3 of: digits, upper, lower, special)',
      cannotDisableSelf: 'You cannot disable your own account',
      cannotDisableAdmin: 'Cannot disable an administrator',
      syncFriends: 'Sync friends with primary admin',
      syncFriendsError: 'Failed to sync friendships',
      roles: {
        admin: 'Admin',
        user: 'User',
        vip: 'VIP'
      }
    }
  },
  file: {
    move: {
      title: 'Move to',
      selectFolderWarning: 'Please select a target folder',
      success: 'Moved successfully',
      failed: 'Move failed'
    }
  },
  preview: {
    title: 'Document Preview',
    downloading: 'Loading document...',
    converting: 'Converting document, please wait...',
    convertingHint: 'First preview requires PDF conversion, cache will be used afterwards',
    error: 'Document preview failed',
    loadFailed: 'Unable to load preview content',
    retry: 'Retry',
    downloadOriginal: 'Download original file',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen'
  }
}
