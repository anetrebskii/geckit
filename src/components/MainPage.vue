<template>
  <div class="van-doc-markdown-body">
    <van-row justify="center">
      <van-col>
        <div class="van-doc-card">
          <van-space>

            <van-button type="primary" @click="callOpenAI('Only adjusts my text or question for clarity.')">Fix text and
              copy</van-button>
            <van-button type="primary"
              @click="callOpenAI('Only translate the text from English to Russian or opposite')">Translate text and
              copy</van-button>
            <van-button type="primary" @click="callOpenAI('Generate concise reply')">Generate reply and copy</van-button>

          </van-space>
        </div>
      </van-col>
    </van-row>
    <van-row>
      <van-col span="24">
        <pre style="white-space: pre-wrap;">
        {{ text }}
      </pre>
      </van-col>
    </van-row>
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
    async callOpenAI(context) {
      const apiKey = window.localStorage.getItem("openApi");

      const configuration = new Configuration({
        apiKey: apiKey,
      });

      const openai = new OpenAIApi(configuration);

      try {
        const completion = await openai.createChatCompletion({
          messages: [
            { role: "system", content: context },
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
