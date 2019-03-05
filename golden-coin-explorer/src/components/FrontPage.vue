<template>
  <div>
    <table>
      <thead>
      <tr>
        <th>#</th>
        <th>hash</th>
        <th>Transactions</th>
        <th>Timestamp</th>
        <th>Date</th>
      </tr>
      </thead>

      <tbody>
      <tr v-for="block in sortBlocks(blocks)">
        <td>{{ block.index }}</td>
        <td><router-link :to="{ name: 'Block', params: { id: block.hash }}">{{ block.hash }}</router-link></td>
        <td>{{ block.data.length }}</td>
        <td>{{ block.timestamp}}</td>
        <td>{{ timeConverter(block.timestamp)}}</td>
      </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
  export default {
    name: 'FrontPage',
    data() {
      return {
        blocks: []
      }
    },
    created() {
      this.getBlocks();
    },
    methods: {
      getBlocks: function () {
        this.$http.get('/api/blocks')
          .then((resp) => {
            this.blocks = resp.data;
          })
      },
      sortBlocks : function(blocks) {
        return _(blocks)
          .sortBy('index')
          .reverse()
          .value();
      },
      timeConverter : function(UNIX_timestamp){
        var a = new Date(UNIX_timestamp * 1000);
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var year = a.getFullYear();
        var month = months[a.getMonth()];
        var date = a.getDate();
        var hour = a.getHours();
        var min = a.getMinutes() < 10 ? '0' + a.getMinutes() : a.getMinutes(); 
        var sec = a.getSeconds() < 10 ? '0' + a.getSeconds() : a.getSeconds();
        var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;
        return time;
      }
    }
  }
</script>


<style scoped>

</style>
