<template>
  <div>
    <input
      v-model="apiInput"
      @input="handleInput"
      :class="{ saved: isSaved }"
    />
    <i v-if="isSaved" class="tick-icon">&#10003;</i>
  </div>
</template>

<script>
export default {
  props: {
    openApiValue: {
      type: String,
      default: ""
    }
  },
  data() {
    return {
      apiInput: this.openApiValue,
      isSaved: false
    };
  },
  methods: {
    handleInput() {
      // Use debounce or a delay here if needed
      this.saveApi();
    },
    async saveApi() {
      try {
        await window.localStorage.setItem("openApi", this.apiInput);
        this.isSaved = true;
      } catch (error) {
        console.error("Failed to save OpenAI API:", error);
      }
    }
  }
};
</script>

<style scoped>
.tick-icon {
  position: absolute; /* You can adjust as per your UI */
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: green;
}
input.saved {
  padding-right: 20px; /* Space for the tick icon */
}
</style>
