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
    images: 'Images',
    videos: 'Videos',
    audio: 'Audio',
    documents: 'Documents',
    categories: 'Categories'
  },
  login: {
    title: 'File Management',
    username: 'Username',
    password: 'Password',
    login: 'Login',
    register: 'Register',
    noAccount: 'No account? Register',
    hasAccount: 'Has account? Login'
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
      size: 'Size',
      date: 'Date Modified',
      action: 'Actions'
    },
    action: {
      rename: 'Rename',
      move: 'Move',
      delete: 'Delete',
      download: 'Download'
    }
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
    all: 'All'
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
  }
}
