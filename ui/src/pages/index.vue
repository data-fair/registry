<template>
  <v-app-bar density="comfortable">
    <v-spacer />
    <personal-menu dark-mode-switch />
  </v-app-bar>
  <v-container class="fill-height">
    <v-row
      align="center"
      justify="center"
    >
      <v-col
        cols="12"
        sm="8"
        md="6"
      >
        <v-card class="pt-8 pb-4 px-8">
          <v-card-title class="text-h4 text-center mb-4">
            Registry
          </v-card-title>
          <v-card-text class="text-center text-body-1">
            A simple registry for the data-fair stack.
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import personalMenu from '@data-fair/lib-vuetify/personal-menu.vue'
</script>
