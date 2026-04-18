<script lang="ts">
import { defineComponent, h } from 'vue'
import type { CFormFieldItem, CFormLabelRenderContext } from './types'

export default defineComponent({
  name: 'CFormLabelRender',
  props: {
    renderFn: {
      type: Function,
      required: true
    },
    model: {
      type: Object,
      required: true
    },
    item: {
      type: Object,
      required: true
    }
  },
  setup(props) {
    return () => {
      const ctx: CFormLabelRenderContext = {
        model: props.model as Record<string, unknown>,
        item: props.item as CFormFieldItem
      }
      return (props.renderFn as (h0: typeof h, c: CFormLabelRenderContext) => unknown)(h, ctx)
    }
  }
})
</script>
