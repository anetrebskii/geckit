<template>
  <div>
    <button @click="callOpenAI('fix')">Update text and copy</button>    
    <button @click="callOpenAI('translate')">Translate text and copy</button>
    <p>{{ text }}</p>
  </div>
</template> 

<script>
import { Configuration, OpenAIApi } from "openai";

export default {
  data() {
    return {
      text: "",
    };
  },
  methods: {
    async callOpenAI(buttonType) {
      const apiKey = window.localStorage.getItem("openApi");

      const context = buttonType === "fix"
        ? "You're a helpful assistant who refines and adjusts my text for clarity."
        : "Translate the text from English to Russian or opposite"

      const configuration = new Configuration({
        apiKey: apiKey,
      });

      const openai = new OpenAIApi(configuration);

      try {
        const completion = await openai.createChatCompletion({
          messages: [
            { role: "system", content: context},
            { role: "user", content: this.text }
            ],
          max_tokens: 1000,
          model: "gpt-3.5-turbo",
        });        
        this.text = completion.data.choices[0].message.content;
      } catch (err) {
        this.text = "Error fetching data from OpenAI";
        console.error("OpenAI API Error:", err);
      }

      this.copyToClipboard();

    },
    async copyToClipboard() {
      try {
        await navigator.clipboard.writeText(this.text);
        // alert("Text copied to clipboard!");
      } catch (err) {
        console.error("Failed to copy text: ", err);
      }
    },
  },
  mounted() {
    console.log(window.api);
    window.electron.receive("shortcut-pressed", (args) => {
      this.text = args.text;
    });
  },
};
</script>

<style scoped>
/* Add your styles here if needed */
</style>
