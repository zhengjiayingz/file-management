import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 通讯录/消息未读总数，供侧边栏与悬浮按钮等共用 */
export const useMessageUnreadStore = defineStore('messageUnread', () => {
  const totalUnread = ref(0)

  const setTotalUnread = (n: number) => {
    const v = Math.floor(Number(n))
    totalUnread.value = Number.isFinite(v) && v >= 0 ? v : 0
  }

  const reset = () => {
    totalUnread.value = 0
  }

  return { totalUnread, setTotalUnread, reset }
})
