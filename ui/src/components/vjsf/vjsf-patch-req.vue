
<script setup>
// @ts-nocheck

import { defineAsyncComponent, defineProps, defineEmits } from 'vue'
import { emits } from '@koumoul/vjsf/composables/use-vjsf.js'

const localeComps = {
  en: defineAsyncComponent(() => import('./vjsf-patch-req-en.vue')),
  fr: defineAsyncComponent(() => import('./vjsf-patch-req-fr.vue'))
}

const props = defineProps({
  locale: {
    type: String,
    required: true
  },
  modelValue: {
    type: null,
    default: null
  },
  options: {
    /** @type import('vue').PropType<import('@koumoul/vjsf/types.js').PartialVjsfOptions | null> */
    type: Object,
    default: null
  }
})

const emit = defineEmits(emits)
</script>

<template>
<component :is="localeComps[locale]" :model-value="modelValue" :options="options" @update:model-value="value => emit('update:modelValue', value)" @update:state="state => emit('update:state')">
  <template v-for="(_, name) in $slots" v-slot:[name]="slotData">
    <slot :name="name" v-bind="slotData" />
  </template>
</component>
</template>
